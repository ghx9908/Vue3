import { ShapeFlags } from "@vue/shared";
import {
  isSameVNodeType,
  Fragment,
  Text,
} from "./createVNode";
import { createInstance, setupComponent } from "./component";
import { ReactiveEffect } from "@vue/reactivity";
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

    const toBePatched = e2 - s2 + 1;
    const newIndexToOldMapIndex = new Array(toBePatched).fill(0);

    for (let i = s1; i <= e1; i++) {
      const prevChild = c1[i];
      let newIndex = keyToNewIndexMap.get(prevChild.key); // 获取新的索引
      if (newIndex == undefined) {
        unmount(prevChild); // 老的有 新的没有直接删除
      } else {
        // a b c d
        // b a e f
        newIndexToOldMapIndex[newIndex - s2] = i + 1;
        //老的里面有 新的里面也有，那就需要做diff算法，比较这两个节点的属性差异和儿子的区别
        patch(prevChild, c2[newIndex], el); // 只是比较了属性，还需要移动位置
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
        patchKeyedChildren(c1, c2, el);
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

  function setupRenderEffect(instance, container) {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        // 初次渲染
        const subTree = instance.render.call(instance.proxy, instance.proxy);
        instance.subTree = subTree;
        patch(null, subTree, container);
        instance.isMounted = true;
      } else {
        const subTree = instance.render.call(instance.proxy, instance.proxy);
        patch(instance.subTree, subTree, container);
        instance.subTree = subTree;
      }
    };
    const effect = new ReactiveEffect(componentUpdateFn)
    const update = instance.update = effect.run.bind(effect);
    update();
  }

  function mountComponent(n2, container) {
    // 1) 给组件生成一个实例 instance
    const instance = (n2.component = createInstance(n2));
    // 2) 初始化实例属性 props attrs slots
    setupComponent(instance);
    // 3) 创建渲染effect
    setupRenderEffect(instance, container);
    // 3) 生成一个effect 并且调用渲染
  }
  const processComponent = (n1, n2, container, anchor) => {
    if (n1 == null) {
      mountComponent(n2, container);
    } else {
      // 组件更新逻辑
    }
  }

  // 元素的渲染
  const patch = (n1, n2, container, anchor = null) => {
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
          processComponent(n1, n2, container, anchor)
        }
    }
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



