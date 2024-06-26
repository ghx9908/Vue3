import { ShapeFlags } from "@vue/shared";
import {
  isSameVNodeType,
  Fragment,
  Text,
} from "./createVNode1";
import { queueJob } from "./scheduler";
import { createComponentInstance, setupComponent } from "./component";
import { ReactiveEffect, reactive } from "@vue/reactivity";
import { getSequence } from "./seq";
import { initProps } from "./componentProps";
export function createRenderer(options) {
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
  } = options

  const mountChildren = (children, container) => {
    for (let i = 0; i < children.length; i++) {
      patch(null, children[i], container);
    }
  }

  //删除老元素
  const unmountChildren = (children) => {
    for (let i = 0; i < children.length; i++) {
      // 递归调用patch方法 创建元素
      unmount(children[i]);
    }
  };
  const mountElement = (vnode, container, anchor) => {
    const { type, props, shapeFlag } = vnode
    let el = vnode.el = hostCreateElement(type); // 创建真实元素，挂载到虚拟节点上
    if (props) { // 处理属性
      for (const key in props) { // 更新元素属性
        hostPatchProp(el, key, null, props[key]);
      }
    }
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) { // 文本
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) { // 多个儿子
      mountChildren(vnode.children, el);
    }
    hostInsert(el, container, anchor); // 插入到容器中
  }

  const patchProps = (oldProps, newProps, el) => {
    for (let key in newProps) {
      // 用新的生效
      hostPatchProp(el, key, oldProps[key], newProps[key]);
    }
    // 老的里面有新的没有则删除
    for (let key in oldProps) {
      if (!(key in newProps)) {
        hostPatchProp(el, key, oldProps[key], null);
      }
    }
  };
  /**
   * 
   * @param c1 VNode1 Childen Arr 旧的
   * @param c2 VNode2 Childen Arr 新的
   * @param el 挂在的元素  node1
   */
  const patchKeyedChildren = (c1, c2, el) => {
    let i = 0; // 头部索引
    let e1 = c1.length - 1;
    let e2 = c2.length - 1;
    // 1. sync from start
    // (a b) c
    // (a b) d e
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i];
      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, el);
      } else {
        break;
      }
      i++;
    }

    // 2. sync from end
    // a (b c)
    // d e (b c)
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2];
      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, el);
      } else {
        break;
      }
      e1--;
      e2--;
    }

    // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0
    // i > e1 说明新的比老的长，有新增的逻辑

    if (i > e1) {// 说明有新增 
      if (i <= e2) { // 表示有新增的部分
        // i - e2之间为新增的部分
        while (i <= e2) {
          // 如果e2 后面呢没有值，说明是向后插入
          // 如果e2 后面的有值， 说明是往前比较的，肯定是向前插入
          const nextPos = e2 + 1;
          const anchor = c2[nextPos]?.el;
          patch(null, c2[i], el, anchor); // 如何选择锚点值
          i++;
        }
      }
      // 4. common sequence + unmount
      // (a b) c
      // (a b)
      // i = 2, e1 = 2, e2 = 1
      // a (b c)
      // (b c)
      // i = 0, e1 = 0, e2 = -1
    } else if (i > e2) {
      // 老的多新的少
      while (i <= e1) {
        // 如果e2 后面呢没有值，说明是向后插入
        // 如果e2 后面的有值， 说明是往前比较的，肯定是向前插入
        unmount(c1[i]); // 如何选择锚点值
        i++;
      }
    }

    // 5. unknown sequence
    // a b [c d e] f g
    // a b [e c d h] f g
    // i = 2, e1 = 4, e2 = 5
    let s1 = i;
    let s2 = i;
    // 将新的元素做成一个映射表，去老的里面找
    const keyToNewIndexMap = new Map();
    for (let i = s2; i <= e2; i++) {
      const nextChild = c2[i];
      keyToNewIndexMap.set(nextChild.key, i); // 不写key就是undefined
    }
    // 去老的里面找，看在新的里面有没有，如果没有，说明老的被删除掉了

    const toBePatched = e2 - s2 + 1;//新的儿子需要有这么多需要被patch
    const newIndexToOldMapIndex = new Array(toBePatched).fill(0);

    for (let i = s1; i <= e1; i++) {
      const prevChild = c1[i];
      let newIndex = keyToNewIndexMap.get(prevChild.key); // 获取新的索引
      if (newIndex == undefined) {
        unmount(prevChild); // 老的有 新的没有直接删除
      } else {
        // a b c d
        // b a e f
        newIndexToOldMapIndex[newIndex - s2] = i + 1;// 新的在老的里面对应的第几个
        //老的里面有 新的里面也有，那就需要做diff算法，比较这两个节点的属性差异和儿子的区别
        patch(prevChild, c2[newIndex], el); // 只是比较了属性，还需要移动位置
      }
    }
    // console.log('newIndexToOldMapIndex=>', newIndexToOldMapIndex)
    let increasingNewIndexSequence = getSequence(newIndexToOldMapIndex);
    let j = increasingNewIndexSequence.length - 1; // 取出最后一个人的索引
    // console.log('=increasingNewIndexSequence>', increasingNewIndexSequence)
    for (let i = toBePatched - 1; i >= 0; i--) {
      const nextIndex = s2 + i; // [ecdh]   找到h的索引 
      const nextChild = c2[nextIndex]; // 找到 h
      let anchor = nextIndex + 1 < c2.length ? c2[nextIndex + 1].el : null; // 找到当前元素的下一个元素
      if (newIndexToOldMapIndex[i] == 0) { // 这是一个新元素 直接创建插入到 当前元素的下一个即可
        patch(null, nextChild, el, anchor)
      } else {
        // 根据参照物 将节点直接移动过去  所有节点都要移动 （但是有些节点可以不动）
        if (i != increasingNewIndexSequence[j]) {
          hostInsert(nextChild.el, el, anchor);; // 操作当前的d 以d下一个作为参照物插入
        } else {
          j--; // 跳过不需要移动的元素， 为了减少移动操作 需要这个最长递增子序列算法  
        }
      }
    }
  }


  const patchChildren = (n1, n2, el) => {
    // 比较前后2个节点的差异

    const c1 = n1 && n1.children // 老儿子
    let c2 = n2.children; // 新儿子

    let prevShapeFlag = n1.shapeFlag; // 上一次
    let shapeFlag = n2.shapeFlag; // 新的一次
    // 文本 数组 空 = 9种

    // 文本 -》 数组 文本删除掉，换成数组 v
    // （文本 -》 空  清空文本 ，  v
    // 文本 -》 文本 用新文本换老的文本 v

    //（数组 -》 文本  移除数组+更新文本  v
    // 数组 -》 空） 移除数组 v
    // 数组 -》 数组 （diff） ---

    // 空 -》 文本  更新文本 v
    // 空 -》 数组  挂载数组 v
    // （空中 -> 空  无需处理） v

    // 新的是文本   
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // 新的是文本，老的是数组移除老的，换新的
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        unmountChildren(c1);
      }
      if (c1 !== c2) {
        // 新的是文本，老的是文本或者空 则直接采用新的
        // 文本有变换
        hostSetElementText(el, c2);
      }
    } else {
      // 新的是数组或者空
      // 旧得为数组
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 旧得为数组 新的为数组
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // diff算法
          patchKeyedChildren(c1, c2, el);
        } else {
          //  旧的是数组， 新的空 卸载
          unmountChildren(c1);
        }
      } else {
        // 旧的为字符或者空  新的为数组或者空
        // patchKeyedChildren(c1, c2, el);
        // 旧的的是文本  && 新的是数组或者空 移除旧的 挂在新的
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(el, "");
        }
        // 本次是数组 则直接挂载即可 
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(c2, el);
        }
      }
    }
  };


  // 核心的diff算法 vnode1旧的  vnode2新的
  const patchElement = (n1, n2) => {
    let el = (n2.el = n1.el);
    const oldProps = n1.props || {};
    const newProps = n2.props || {};
    patchProps(oldProps, newProps, el); // 比对新老属性
    patchChildren(n1, n2, el); // 比较元素的孩子节点
  }


  // 处理文本
  function processText(n1, n2, container) {
    if (n1 == null) {
      hostInsert((n2.el = hostCreateText(n2.children)), container);
    } else {
      let el = (n2.el = n1.el);
      if (n2.children != n1.children) {
        hostSetText(el, n2.children);
      }
    }
  }

  const processFragment = (n1, n2, container) => {
    if (n1 == null) {
      mountChildren(n2.children, container);
    } else {
      patchChildren(n1, n2, container);
    }
  }

  function processElement(n1, n2, container, anchor) {
    if (n1 == null) {
      // 初始化逻辑
      mountElement(n2, container, anchor);
    } else {
      patchElement(n1, n2);
    }
  }

  function updateProps(prevProps, nextProps) {
    for (const key in nextProps) { // 循环props
      prevProps[key] = nextProps[key]; // 响应式属性更新后会重新渲染
    }
    for (const key in prevProps) { // 循环props
      if (!(key in nextProps)) {
        delete prevProps[key]
      }
    }
  }

  // 在渲染前记得要更新变化的属性
  function updatePreRender(instance, next) {
    instance.next = null;
    instance.vnode = next; // 更新虚拟节点
    updateProps(instance.props, next.props);// 更新属性
  }
  function setupRenderEffect(instance, el, anchor) {
    const componentUpdateFn = () => {
      // 组件要渲染的 虚拟节点是render函数返回的结果
      // 组件有自己的虚拟节点，返回的虚拟节点 subTree
      if (!instance.isMounted) {
        const subTree = instance.render.call(instance.proxy, instance.proxy); // 这里先暂且将proxy 设置为状态
        patch(null, subTree, el, anchor);
        instance.subTree = subTree; // 记录第一次的subTree
        instance.isMounted = true;
      } else {
        const prevSubTree = instance.subTree;
        // 这里再下次渲染前需要更新属性，更新属性后再渲染，获取最新的虚拟ODM ， n2.props 来更instance.的props
        const next = instance.next;
        if (next) {
          // 说明属性有更新
          updatePreRender(instance, next); // 因为更新前会清理依赖，所以这里更改属性不会触发渲染
        }
        const nextSubTree = instance.render.call(
          // 这里调用render时会重新依赖收集
          instance.proxy,
          instance.proxy
        );
        instance.subTree = nextSubTree;
        patch(prevSubTree, nextSubTree, el, anchor);
      }
      // 当调用render方法的时候 会触发响应式的数据访问，进行effect的收集
      // 所以数据变化后会重新触发effect执行
    };
    const effect = new ReactiveEffect(componentUpdateFn, () => {
      // 这里我们可以延迟调用componentUpdateFn
      // 批处理 + 去重
      queueJob(instance.update);
    }); // 对应的effect方法
    const update = (instance.update = effect.run.bind(effect));
    update();
  }
  function mountComponent(vnode, container, anchor, parnetComponent) {

    // 1) 创建实例
    const instance = vnode.component = createComponentInstance(vnode, parnetComponent);

    // 2) 给实例赋值
    setupComponent(instance)

    // 3) 创建渲染effect及更新
    setupRenderEffect(instance, container, anchor);
  }

  const hasPropsChanged = (prevProps = {}, nextProps = {}) => {
    const nextKeys = Object.keys(nextProps);
    // 直接看数量、数量后变化 就不用遍历了
    if (nextKeys.length !== Object.keys(prevProps).length) {
      return true;
    }
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i];
      if (nextProps[key] !== prevProps[key]) {
        return true;
      }
    }
    return false
  }
  function shouldComponentUpdate(n1, n2) {
    const oldProps = n1.props;
    const newProps = n2.props;

    if (oldProps == newProps) return false;

    return hasPropsChanged(oldProps, newProps);
  }

  // 组建的更新逻辑
  const updateComponent = (n1, n2, el, anchor) => {
    const instance = (n2.component = n1.component);
    // 内部props是响应式的所以更新 props就能自动更新视图  vue2就是这样搞的
    // instance.props.message = n2.props.message;

    // 这里我们可以比较属性，如果属性发生变化了，我们调用instance.update 来处理更新逻辑，统一更新的入口
    // updateProps(oldProps, newProps);
    if (shouldComponentUpdate(n1, n2)) {
      instance.next = n2; // 暂存新的虚拟节点
      instance.update();
    }
  };
  const processComponent = (n1, n2, container, anchor, parnetComponent) => {
    if (n1 == null) {
      mountComponent(n2, container, anchor, parnetComponent);
    } else {
      // 组件更新逻辑
      updateComponent(n1, n2, container, anchor, parnetComponent); // 组件的属性变化了,或者插槽变化了
    }
  }

  // 元素的渲染
  const patch = (n1, n2, container, anchor = null, parnetComponent = null) => {
    // 初始化和diff算法都在这里喲
    if (n1 == n2) {
      return
    }
    // 两个不同虚拟节点不需要进行比较，直接移除老节点，将新的虚拟节点渲染成真实DOM进行挂载即可
    if (n1 && !isSameVNodeType(n1, n2)) { // 有n1 但是n1和n2不是同一个节点
      unmount(n1)
      n1 = null
    }

    const { type, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container); // 处理文本
        break;
      case Fragment:
        processFragment(n1, n2, container); // 处理fragment
        break;
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          processElement(n1, n2, container, anchor); // 之前处理元素的逻辑
        } else if (shapeFlag & ShapeFlags.COMPONENT) { // 组建的渲染
          processComponent(n1, n2, container, anchor, parnetComponent)
        }
    }
    // 组件分成普通组件和函数组件 对于vue3 我们些的普通组建 通过render函数来返回虚拟节点的

  }

  const unmount = (vnode) => {
    if (vnode.type === Fragment) {
      return unmountChildren(vnode.children)
    }
    hostRemove(vnode.el)

  }

  const render = (vnode, container) => {
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode); // 找到对应的真实节点将其卸载
      } // 卸载
    } else {
      patch(container._vnode || null, vnode, container); // 初始化和更新
    }
    container._vnode = vnode;
  }
  return {
    render
  }
}

// 卸载
// createRenderer(renderOptions).render(null,document.getElementById('app'));



