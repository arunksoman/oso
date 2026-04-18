<script>
  import { HugeiconsIcon as BaseHugeiconsIcon } from '@hugeicons/svelte';

  let { icon, strokeWidth = 2, ...props } = $props();
</script>

<BaseHugeiconsIcon {icon} {...props} {strokeWidth} />