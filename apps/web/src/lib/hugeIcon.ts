import { h, defineComponent, type Component } from 'vue';
import { HugeiconsIcon } from '@hugeicons/vue';

export function createHugeIcon(icon: unknown): Component {
  return defineComponent({
    name: 'HugeIcon',
    inheritAttrs: false,
    props: {
      size: { type: [Number, String], default: 24 },
      strokeWidth: { type: [Number, String], default: 1.5 },
      color: { type: String, default: 'currentColor' },
    },
    setup(props, { attrs }) {
      return () =>
        h(HugeiconsIcon, {
          icon: icon as any,
          size: props.size,
          strokeWidth: Number(props.strokeWidth) || 1.5,
          color: props.color,
          ...attrs,
        });
    },
  });
}
