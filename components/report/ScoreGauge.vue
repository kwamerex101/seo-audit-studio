<script setup lang="ts">
import { Chart, ArcElement, Tooltip, DoughnutController } from "chart.js";

Chart.register(ArcElement, Tooltip, DoughnutController);

const props = defineProps<{
  label: string;
  value: number | null | undefined;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const clamped = computed(() =>
  Math.max(0, Math.min(100, Math.round(props.value ?? 0))),
);

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

onMounted(render);
watch([clamped, color], render);
onBeforeUnmount(() => {
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
