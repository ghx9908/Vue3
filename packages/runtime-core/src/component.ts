import { proxyRefs, reactive } from "@vue/reactivity";
import { initProps } from "./componentProps";
import { isFunction, isObject } from "@vue/shared";
export function createComponentInstance(n2) {
  const instance = {
    // 组件的实例，用它来记录组件中的属性
    setupState: {},
    state: {},
    isMounted: false, // 是否挂栽成功
    vnode: n2, // 组件的虚拟节点
    subTree: null, // 组件渲染的虚拟节点
    update: null, // 用于组件更新的方法
    propsOptions: n2.type.props, // 用户传递的props
    props: {},
    attrs: {},
    slots: {},
    render: null,
    proxy: null, // 帮我们做代理 -> proxyRefs
  };
  return instance;
}

export function setupComponent(instance) {
  let { type, props } = instance.vnode;
  const publicProperties = {
    $attrs: (instance) => instance.attrs,
    $props: (instance) => instance.props,
  };
  instance.proxy = new Proxy(instance, {
    get(target, key) {
      const { state, props, setupState } = target;
      if (key in state) {
        return state[key];
      } else if (key in setupState) {
        return setupState[key];
      } else if (key in props) {
        return props[key];
      }
      const getter = publicProperties[key];
      if (getter) {
        return getter(instance); // 将instance传递进去
      }
    },
    set(target, key, value) {
      const { state, props, setupState } = target;
      if (key in state) {
        state[key] = value;
        return true;
      } else if (key in setupState) {
        setupState[key] = value;
        return true;
      } else if (key in props) {
        console.warn(
          // 组件不能修改属性了
          `mutate prop ${key as string} not allowed, props are readonly`
        );
        return false;
      }
      return true;
    },
  });
  initProps(instance, props);
  const setup = type.setup; // 用户编写的setup方法
  if (setup) {
    const setupResult = setup(instance.props, {
      attrs: instance.attrs, // 完成
      emit: (eventName, ...args) => {
        // onMyEvent  onMyEvent
        let handler =
          props[`on${eventName[0].toUpperCase()}${eventName.slice(1)}`];
        if (handler) {
          let handlers = Array.isArray(handler) ? handler : [handler];
          handlers.forEach((handler) => handler(...args));
        }
      },
      // 插槽的更新
      // 组件的生命周期
      // vue3中的靶向更新，编译优化原理ast语法树、代码转换、代码生成
      // 组件实现  provide\inject\....
      // pinia vue-router原理
      // compile()
      // 组件、树、表格、滚动组件
      slots: instance.slots,
      expose(exposed) {
        // 主要用于ref ，通过ref获取组件的时候 在vue里只能获取到组件实例，但是在vue3中如果提供了
        // exposed 则获取的就是exposed属性
        instance.exposed = exposed;
      },
    });

    if (isObject(setupResult)) {
      // 返回的是setup提供的数据源头
      instance.setupState = proxyRefs(setupResult);
    } else if (isFunction(setupResult)) {
      instance.render = setupResult;
    }
  }

  const data = type.data;
  if (data) {
    instance.state = reactive(data());
  }
  !instance.render && (instance.render = type.render);
}
