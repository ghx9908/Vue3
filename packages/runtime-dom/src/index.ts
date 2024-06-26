import { nodeOps } from "./nodeOps"
import { patchProp } from "./patchProp"
//自己创建渲染器
import { createRenderer } from "@vue/runtime-core";

// 准备好所有渲染时所需要的的属性
// 已经提供好了的渲染器

export const renderOptions = Object.assign({ patchProp }, nodeOps)



export function render(vnode, container) {
  createRenderer(renderOptions).render(vnode, container)
}
export * from "@vue/runtime-core";
