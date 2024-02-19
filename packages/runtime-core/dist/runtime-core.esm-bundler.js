import { isString, isObject, isFunction } from '@vue/shared';
import { reactive, proxyRefs, ReactiveEffect } from '@vue/reactivity';
export * from '@vue/reactivity';

const Text = Symbol("Text");
const Fragment = Symbol("Fragment");
function isVNode(val) {
    return !!(val && val.__v_isVNode);
}
function isSameVNodeType(n1, n2) {
    return n1.type === n2.type && n1.key === n2.key;
}
function createVNode(type, props, children = null) {
    // React.createElement
    const shapeFlag = isString(type) ? 1 /* ShapeFlags.ELEMENT */ : isObject(type) ? 4 /* ShapeFlags.STATEFUL_COMPONENT */ : 0;
    const vnode = {
        shapeFlag,
        __v_isVNode: true,
        type,
        props,
        key: props && props.key,
        el: null,
        children,
    };
    if (children) {
        let type = 0;
        if (Array.isArray(children)) {
            type = 16 /* ShapeFlags.ARRAY_CHILDREN */;
        }
        else {
            type = 8 /* ShapeFlags.TEXT_CHILDREN */;
        }
        vnode.shapeFlag |= type;
    }
    return vnode;
}
// 创建元素的时候  createElement()  children.forEach(child=> createElement(child))
//  createElement()   createElement.innerHTML = children
// if(Array.isArray(children))
// 对象可能是组件  还有可能是其他类型

function h(type, propsOrChildren, children) {
    const l = arguments.length;
    if (l === 2) { // 只有属性，或者一个元素儿子的时候
        if (isObject(propsOrChildren) && !Array.isArray(propsOrChildren)) {
            if (isVNode(propsOrChildren)) { // h('div',h('span'))
                return createVNode(type, null, [propsOrChildren]);
            }
            return createVNode(type, propsOrChildren); // h('div',{style:{color:'red'}});
        }
        else {
            // const VDom = h('div','hello')
            // const VDom = h('div', [h('span'), h('span')])
            return createVNode(type, null, propsOrChildren); // h('div',null,[h('span'),h('span')])
        }
    }
    else {
        if (l > 3) { // 超过3个除了前两个都是儿子
            // const VDom = h('div', {}, h('span'), h('span'), h('span'), h('span'))
            children = Array.prototype.slice.call(arguments, 2);
        }
        else if (l === 3 && isVNode(children)) {
            // const VDom = h('div', {}, h('span'))
            children = [children]; // 儿子是元素将其包装成 h('div',null,[h('span')])
        }
        return createVNode(type, propsOrChildren, children); // h('div',null,'jw')
    }
}
// 注意子节点是：数组、文本、null

const queue = [];
let isFlushing = false;
const p = Promise.resolve();
function queueJob(job) {
    if (!queue.includes(job)) {
        queue.push(job); // 存储当前更新的操作
    }
    // 数据变化更 可能会出现多个组件的更新，所有需要采用队列来存储
    if (!isFlushing) {
        isFlushing = true; // 通过批处理来实现的
        p.then(() => {
            isFlushing = false;
            let copyQueue = queue.slice(0); // 将当前要执行的队列拷贝一份，并且清空队列
            queue.length = 0;
            copyQueue.forEach((job) => {
                job();
            });
            copyQueue.length = 0;
        });
    }
}
// 浏览器的事件环、一轮一轮的实现

function initProps(instance, rawProps) {
    const props = {};
    const attrs = {};
    const options = instance.propsOptions || {};
    if (rawProps) {
        for (let key in rawProps) {
            if (key in options) {
                props[key] = rawProps[key];
            }
            else {
                attrs[key] = rawProps[key];
            }
        }
    }
    // 属性是响应式的，属性变化了 会造成页面更新
    instance.props = reactive(props); // 属性会被变成响应式  props也可以不是响应式的
    instance.attrs = attrs;
}

function createComponentInstance(n2) {
    const instance = {
        // 组件的实例，用它来记录组件中的属性
        setupState: {},
        state: {},
        isMounted: false,
        vnode: n2,
        subTree: null,
        update: null,
        propsOptions: n2.type.props,
        props: {},
        attrs: {},
        slots: {},
        render: null,
        proxy: null, // 帮我们做代理 -> proxyRefs
    };
    return instance;
}
function setupComponent(instance) {
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
            }
            else if (key in setupState) {
                return setupState[key];
            }
            else if (key in props) {
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
            }
            else if (key in setupState) {
                setupState[key] = value;
                return true;
            }
            else if (key in props) {
                console.warn(
                // 组件不能修改属性了
                `mutate prop ${key} not allowed, props are readonly`);
                return false;
            }
            return true;
        },
    });
    initProps(instance, props);
    const setup = type.setup; // 用户编写的setup方法
    if (setup) {
        const setupResult = setup(instance.props, {
            attrs: instance.attrs,
            emit: (eventName, ...args) => {
                // onMyEvent  onMyEvent
                let handler = props[`on${eventName[0].toUpperCase()}${eventName.slice(1)}`];
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
        }
        else if (isFunction(setupResult)) {
            instance.render = setupResult;
        }
    }
    const data = type.data;
    if (data) {
        instance.state = reactive(data());
    }
    !instance.render && (instance.render = type.render);
}

// 如何求最长递增子序列 -》  最终序列的索引是我们要的结果
// 先求出最长递增子序列的个数
//  3 5 7 4 2 8 9 11 6 10  (贪心 + 二分查找)
// 找更有潜力的一项 作为末尾
// 3
// 3 5
// 3 5 7
// 3 4 7 (递增序列差找某个元素 可以使用二分查找，找到比4大的那一项，将其换掉)
// 2 4 7
// 2 4 7 8
// 2 4 7 8 9
// 2 4 7 8 9 11
// 2 4 6 8 9 11
// 2 4 6 8 9 10
// 有了个数 我们可以采用倒叙追踪的方式，查找正确的序列
// 3 5 7 8 9 10
// [1,2,3,4,5,6,7,8,9,0] -> [0,1,2,3,4,5,6,7,8]
function getSequence(arr) {
    const result = [0];
    const len = arr.length;
    const p = arr.slice(0).fill(-1); // 用来存储标记的索引， 内容无所谓主要是和数组的长度一致
    let start;
    let end;
    let middle;
    for (let i = 0; i < len; i++) {
        const arrI = arr[i];
        if (arrI !== 0) {
            let resultLastIndex = result[result.length - 1]; // 获取结果集中的最后一个
            // 和arrI中的去比较
            if (arr[resultLastIndex] < arrI) {
                result.push(i);
                p[i] = resultLastIndex; // 记录上一次最后一个人的索引
                continue;
            }
            // 如果比当前末尾小，需要通过二分查找找到比当前这一项大的用这一项替换掉他
            start = 0;
            end = result.length - 1;
            while (start < end) {
                middle = ((start + end) / 2) | 0; // 向下取值
                if (arr[result[middle]] < arrI) {
                    start = middle + 1;
                }
                else {
                    end = middle;
                }
            }
            // 最终start 和 end 会重合
            p[i] = result[start - 1]; // 记录前一个人的索引
            result[start] = i; // 直接用当前的索引换掉
        }
    }
    // 实现倒序追踪
    let i = result.length; // 总长度
    let last = result[i - 1]; // 获取最后一项
    while (i-- > 0) {
        result[i] = last; // 最后一项是正确
        last = p[last]; // 通过最后一项找到对应的结果，将他作为最后一项来进行追踪
    }
    return result;
}
// console.log(getSequence([2, 3, 1, 5, 6, 8, 7, 9, 4]));

function createRenderer(options) {
    const { insert: hostInsert, remove: hostRemove, patchProp: hostPatchProp, createElement: hostCreateElement, createText: hostCreateText, setText: hostSetText, setElementText: hostSetElementText, parentNode: hostParentNode, nextSibling: hostNextSibling, } = options;
    const mountChildren = (children, container) => {
        for (let i = 0; i < children.length; i++) {
            patch(null, children[i], container);
        }
    };
    //删除老元素
    const unmountChildren = (children) => {
        for (let i = 0; i < children.length; i++) {
            // 递归调用patch方法 创建元素
            unmount(children[i]);
        }
    };
    const mountElement = (vnode, container, anchor) => {
        const { type, props, shapeFlag } = vnode;
        let el = vnode.el = hostCreateElement(type); // 创建真实元素，挂载到虚拟节点上
        if (props) { // 处理属性
            for (const key in props) { // 更新元素属性
                hostPatchProp(el, key, null, props[key]);
            }
        }
        if (shapeFlag & 8 /* ShapeFlags.TEXT_CHILDREN */) { // 文本
            hostSetElementText(el, vnode.children);
        }
        else if (shapeFlag & 16 /* ShapeFlags.ARRAY_CHILDREN */) { // 多个儿子
            mountChildren(vnode.children, el);
        }
        hostInsert(el, container, anchor); // 插入到容器中
    };
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
        var _a;
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
            }
            else {
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
            }
            else {
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
        if (i > e1) { // 说明有新增 
            if (i <= e2) { // 表示有新增的部分
                // i - e2之间为新增的部分
                while (i <= e2) {
                    // 如果e2 后面呢没有值，说明是向后插入
                    // 如果e2 后面的有值， 说明是往前比较的，肯定是向前插入
                    const nextPos = e2 + 1;
                    const anchor = (_a = c2[nextPos]) === null || _a === void 0 ? void 0 : _a.el;
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
        }
        else if (i > e2) {
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
        const toBePatched = e2 - s2 + 1; //新的儿子需要有这么多需要被patch
        const newIndexToOldMapIndex = new Array(toBePatched).fill(0);
        for (let i = s1; i <= e1; i++) {
            const prevChild = c1[i];
            let newIndex = keyToNewIndexMap.get(prevChild.key); // 获取新的索引
            if (newIndex == undefined) {
                unmount(prevChild); // 老的有 新的没有直接删除
            }
            else {
                // a b c d
                // b a e f
                newIndexToOldMapIndex[newIndex - s2] = i + 1; // 新的在老的里面对应的第几个
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
                patch(null, nextChild, el, anchor);
            }
            else {
                // 根据参照物 将节点直接移动过去  所有节点都要移动 （但是有些节点可以不动）
                if (i != increasingNewIndexSequence[j]) {
                    hostInsert(nextChild.el, el, anchor);
                }
                else {
                    j--; // 跳过不需要移动的元素， 为了减少移动操作 需要这个最长递增子序列算法  
                }
            }
        }
    };
    const patchChildren = (n1, n2, el) => {
        // 比较前后2个节点的差异
        const c1 = n1 && n1.children; // 老儿子
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
        if (shapeFlag & 8 /* ShapeFlags.TEXT_CHILDREN */) {
            // 新的是文本，老的是数组移除老的，换新的
            if (prevShapeFlag & 16 /* ShapeFlags.ARRAY_CHILDREN */) {
                unmountChildren(c1);
            }
            if (c1 !== c2) {
                // 新的是文本，老的是文本或者空 则直接采用新的
                // 文本有变换
                hostSetElementText(el, c2);
            }
        }
        else {
            // 新的是数组或者空
            // 旧得为数组
            if (prevShapeFlag & 16 /* ShapeFlags.ARRAY_CHILDREN */) {
                // 旧得为数组 新的为数组
                if (shapeFlag & 16 /* ShapeFlags.ARRAY_CHILDREN */) {
                    // diff算法
                    patchKeyedChildren(c1, c2, el);
                }
                else {
                    //  旧的是数组， 新的空 卸载
                    unmountChildren(c1);
                }
            }
            else {
                // 旧的为字符或者空  新的为数组或者空
                patchKeyedChildren(c1, c2, el);
                // 旧的的是文本  && 新的是数组或者空 移除旧的 挂在新的
                if (prevShapeFlag & 8 /* ShapeFlags.TEXT_CHILDREN */) {
                    hostSetElementText(el, "");
                }
                // 本次是数组 则直接挂载即可 
                if (shapeFlag & 16 /* ShapeFlags.ARRAY_CHILDREN */) {
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
    };
    // 处理文本
    function processText(n1, n2, container) {
        if (n1 == null) {
            hostInsert((n2.el = hostCreateText(n2.children)), container);
        }
        else {
            let el = (n2.el = n1.el);
            if (n2.children != n1.children) {
                hostSetText(el, n2.children);
            }
        }
    }
    const processFragment = (n1, n2, container) => {
        if (n1 == null) {
            mountChildren(n2.children, container);
        }
        else {
            patchChildren(n1, n2, container);
        }
    };
    function processElement(n1, n2, container, anchor) {
        if (n1 == null) {
            // 初始化逻辑
            mountElement(n2, container, anchor);
        }
        else {
            patchElement(n1, n2);
        }
    }
    function updateProps(prevProps, nextProps) {
        for (const key in nextProps) { // 循环props
            prevProps[key] = nextProps[key]; // 响应式属性更新后会重新渲染
        }
        for (const key in prevProps) { // 循环props
            if (!(key in nextProps)) {
                delete prevProps[key];
            }
        }
    }
    // 在渲染前记得要更新变化的属性
    function updatePreRender(instance, next) {
        instance.next = null;
        instance.vnode = next; // 更新虚拟节点
        updateProps(instance.props, next.props); // 更新属性
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
            }
            else {
                const prevSubTree = instance.subTree;
                // 这里再下次渲染前需要更新属性，更新属性后再渲染，获取最新的虚拟ODM ， n2.props 来更instance.的props
                const next = instance.next;
                if (next) {
                    // 说明属性有更新
                    updatePreRender(instance, next); // 因为更新前会清理依赖，所以这里更改属性不会触发渲染
                }
                const nextSubTree = instance.render.call(
                // 这里调用render时会重新依赖收集
                instance.proxy, instance.proxy);
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
    function mountComponent(vnode, container, anchor) {
        // 1) 创建实例
        const instance = vnode.component = createComponentInstance(vnode);
        // 2) 给实例赋值
        setupComponent(instance);
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
        return false;
    };
    function shouldComponentUpdate(n1, n2) {
        const oldProps = n1.props;
        const newProps = n2.props;
        if (oldProps == newProps)
            return false;
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
    const processComponent = (n1, n2, container, anchor) => {
        if (n1 == null) {
            mountComponent(n2, container, anchor);
        }
        else {
            // 组件更新逻辑
            updateComponent(n1, n2); // 组件的属性变化了,或者插槽变化了
        }
    };
    // 元素的渲染
    const patch = (n1, n2, container, anchor = null) => {
        // 初始化和diff算法都在这里喲
        if (n1 == n2) {
            return;
        }
        // 两个不同虚拟节点不需要进行比较，直接移除老节点，将新的虚拟节点渲染成真实DOM进行挂载即可
        if (n1 && !isSameVNodeType(n1, n2)) { // 有n1 但是n1和n2不是同一个节点
            unmount(n1);
            n1 = null;
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
                if (shapeFlag & 1 /* ShapeFlags.ELEMENT */) {
                    processElement(n1, n2, container, anchor); // 之前处理元素的逻辑
                }
                else if (shapeFlag & 6 /* ShapeFlags.COMPONENT */) { // 组建的渲染
                    processComponent(n1, n2, container, anchor);
                }
        }
    };
    const unmount = (vnode) => {
        if (vnode.type === Fragment) {
            return unmountChildren(vnode.children);
        }
        hostRemove(vnode.el);
    };
    const render = (vnode, container) => {
        if (vnode == null) {
            if (container._vnode) {
                unmount(container._vnode); // 找到对应的真实节点将其卸载
            } // 卸载
        }
        else {
            patch(container._vnode || null, vnode, container); // 初始化和更新
        }
        container._vnode = vnode;
    };
    return {
        render
    };
}
// 卸载
// createRenderer(renderOptions).render(null,document.getElementById('app'));

export { Fragment, Text, createRenderer, createVNode, h, isSameVNodeType, isVNode };
