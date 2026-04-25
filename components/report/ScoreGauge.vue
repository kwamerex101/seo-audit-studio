<script setup lang="ts">
import { Chart, ArcElement, Tooltip, DoughnutController } from "chart.js";

Chart.register(ArcElement, Tooltip, DoughnutController);

const props = defineProps<{
  label: string;
  value: number | null | undefined;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const target = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.value ?? 0))),
);
const animated = ref(0);
const clamped = animated; // keep variable name compat with the canvas render code

let raf: number | null = null;
function animateTo(value: number) {
  if (raf) cancelAnimationFrame(raf);
  const start = animated.value;
  const change = value - start;
  if (change === 0) return;
  const duration = 700; // ms
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / duration);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    animated.value = Math.round(start + change * eased);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

const color = computed(() => {
  const v = clamped.value;
  if (v >= 70) return "#4ade80";
  if (v >= 40) return "#facc15";
  return "#f87171";
});

function render() {
  if (!canvas.value) return;
  if (chart) {
    chart.data.datasets[0].data = [clamped.value, 100 - clamped.value];
    (chart.data.datasets[0].backgroundColor as string[]) = [
      color.value,
      "#24304a",
    ];
    chart.update();
    return;
  }
  chart = new Chart(canvas.value, {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [clamped.value, 100 - clamped.value],
          backgroundColor: [color.value, "#24304a"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      cutout: "72%",
      plugins: { tooltip: { enabled: false } },
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

onMounted(() => {
  render();
  // Defer one frame so initial mount paints with 0 then animates up.
  requestAnimationFrame(() => animateTo(target.value));
});
watch(target, (v) => animateTo(v));
watch([clamped, color], render);
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div class="card flex flex-col items-center justify-center">
    <div class="mb-2 text-xs uppercase tracking-wide text-mute">
      {{ label }}
    </div>
    <div class="relative h-32 w-32">
      <canvas ref="canvas" class="h-full w-full" />
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <div class="text-3xl font-bold">{{ clamped }}</div>
          <div class="text-[10px] uppercase tracking-wider text-mute">
            of 100
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
