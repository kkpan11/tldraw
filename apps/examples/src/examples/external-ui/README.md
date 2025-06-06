---
title: External UI (using state)
component: ./ExternalUiExample.tsx
category: layout
priority: 20
keywords: [outside, editor]
---

This example shows how to control the tldraw editor from an external UI, using state.

---

This example shows how to control the tldraw editor from an external UI, outside
of the `Tldraw` component. There are a few ways of doing this—for example, by putting the editor on the window object, passing it around via props, or using React context.

In this example, we'll just put the editor instance in state and use it in the same component. See the [other External UI example](https://tldraw.dev/examples/external-ui-context) for an alternative (and more realistic) solution using React context.
