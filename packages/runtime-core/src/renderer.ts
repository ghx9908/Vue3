import { ShapeFlags } from "@vue/shared"
import { isSameVNodeType } from "./createVNode"
import { getSequence } from "./seq"

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

  // 第一次挂载
  /**
   *
   * @param children [vnode1.vnode2]
   * @param container 容器 真实dom
   */
  function mountChildren(children, container) {
    for (let i = 0; i < children.length; i++) {
      patch(null, children[i], container)
    }
  }

  function mountElement(vnode, container, anchor) {
    const { type, props, shapeFlag } = vnode
    let el = (vnode.el = hostCreateElement(type))

    if (props) {
      for (const key in props) {
        hostPatchProp(el, key, null, props[key])
      }
    }

    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      // 文本
      hostSetElementText(el, vnode.children)
    } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      // 多个儿子
      mountChildren(vnode.children, el)
    }
    hostInsert(el, container, anchor) // 插入到容器中
  }

  function patchProps(oldProps, newProps, el) {
    for (let key in newProps) {
      hostPatchProp(el, key, oldProps[key], newProps[key])
    }
    // 删除多余的属性
    for (let key in oldProps) {
      if (!(key in newProps)) {
        hostPatchProp(el, key, oldProps[key], newProps[key])
      }
    }
  }

  function unmountChildren(children) {
    for (let i = 0; i < children.length; i++) {
      unmount(children[i])
    }
  }


  /**
   * 
   * @param c1  VNode1 Childen Arr 旧的
   * @param c2 VNode2 Childen Arr 新的
   * @param container 旧的对应的真是dom
   */
  function patchKeyedChildren(c1, c2, container) {
    let i = 0
    let e1 = c1.length - 1;
    let e2 = c2.length - 1;
    // 1. sync from start
    // (a b) c
    // (a b) d e
    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = c2[i]
      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, container)
      } else {
        break
      }
      i++
    }
    // i=2
    // 2. sync from end
    // a (b c)
    // d e (b c)
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1]
      const n2 = c2[e2]
      if (isSameVNodeType(n1, n2)) {
        patch(n1, n2, container)
      } else {
        break
      }
      e1--
      e2--
    }
    // el = 5 e2 =5 i=2

    // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0

    if (i > e1 && i <= e2) {
      const anchor = c2[e2 + 1]?.el;// 下一个元素
      while (i <= e2) {
        patch(null, c2[i], container, anchor)
        i++
      }
    }

    // 4. common sequence + unmount
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    else if (i > e2 && i <= e1) {
      while (i <= e1) {
        unmount(c1[i])
        i++
      }

    }
    // 5. unknown sequence
    // [i ... e1 + 1]: a b [c d e] f g
    // [i ... e2 + 1]: a b [e d c h] f g
    // i = 2, e1 = 4, e2 = 5

    else {
      const s1 = i // prev starting index
      const s2 = i // next starting index
      // 5.1 将新的元素做成一个映射表 <newIndex key, newIndex>
      const keyToNewIndexMap = new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i];
        // 第几个 并不是index
        keyToNewIndexMap.set(nextChild.key, i); // 不写key就是undefined
      }
      // 5.2 循环遍历待修补的旧子节点，并尝试修补匹配节点并删除不再存在的节点
      const toBePatched = e2 - s2 + 1 // 待修补的节点个数 
      const newIndexToOldIndexMap = new Array(toBePatched)// 映射表
      // oldIndex = 0是一个特殊值，表示新节点没有对应的旧节点
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0

      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i]
        let newIndex = keyToNewIndexMap.get(prevChild.key)// 获取新节点中key对应的索引
        if (newIndex === undefined) {// 新的里面不存在 删除
          unmount(prevChild)
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1// 更新映射表  新索引-s2 对应的是旧索引+1
          patch(prevChild, c2[newIndex], container);
        }
      }
      //  5.3 move and mount 移动和挂载
      let increasingNewIndexSequence = getSequence(newIndexToOldIndexMap);
      let j = increasingNewIndexSequence.length - 1; // 取出最后一个人的索引
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i; //[ecdh]   找到h的索引
        const nextChild = c2[nextIndex]
        let anchor = nextIndex + 1 < c2.length ? c2[nextIndex + 1].el : null; // 找到当前元素的下一个元素
        if (newIndexToOldIndexMap[i] == 0) {
          // 这是一个新元素 直接创建插入到 当前元素的下一个即可
          patch(null, nextChild, container, anchor);
        } else {

          if (i != increasingNewIndexSequence[j]) {
            hostInsert(nextChild.el, container, anchor);//操作当前的d 以d下一个作为参照物插入
          } else {
            j--;
          }

        }
      }

    }




    console.log(i, e1, e2)
  }
  const patchChildren = (n1, n2, el) => {
    let c1 = n1 && n1.children
    let c2 = n2.children
    let prevShapeFlag = n1.shapeFlag
    let shapeFlag = n2.shapeFlag
    // 新的是文本
    if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {// 老的是数组
        unmountChildren(c1)
      }
      if (c1 !== c2) {
        hostSetElementText(el, c2);// 设置文本
      }
    } else {
      // 新的为空或者 数组

      if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          // 核心diff
          patchKeyedChildren(c1, c2, el)
        } else {
          unmountChildren(c1)
        }
      } else {
        if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
          hostSetElementText(el, "");
        }
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(c2, el);
        }
      }
    }

  }
  // 核心的diff算法 vnode1旧的  vnode2新的
  function patchElement(n1, n2) {
    let el = (n2.el = n1.el)
    const oldProps = n1.props || {}
    const newProps = n2.props || {}

    patchProps(oldProps, newProps, el) // 比对新老属性
    patchChildren(n1, n2, el)
  }

  function processElement(n1, n2, container, anchor) {
    if (n1 == null) {
      // 挂载
      mountElement(n2, container, anchor)
    } else {
      //diff
      patchElement(n1, n2) // 比较两个元素(n1, n2, container);
    }
  }

  /**
   *
   * @param n1 老的vnode
   * @param n2 新的vnode
   * @param container 容器
   */
  function patch(n1, n2, container, anchor?) {
    if (n1 == n2) {
      return
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      // 有n1 是n1和n2不是同一个节点
      unmount(n1)
      n1 = null
    }
    processElement(n1, n2, container, anchor)
  }

  function unmount(vnode) {
    hostRemove(vnode.el)
  }

  const render = (vnode, container) => {
    if (vnode == null) {
      if (container._vnode) {
        //卸载
        unmount(container._vnode)
      }
    } else {
      //初次挂载或者更新
      patch(container._vnode || null, vnode, container)
    }
    container._vnode = vnode
  }

  return {
    render,
  }
}
