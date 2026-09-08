<template>
  <div class="risk-tags"
    ><ElTag
      v-for="risk in risks"
      :key="risk"
      :type="/延期|阻塞/.test(risk) ? 'danger' : 'warning'"
      size="small"
      effect="light"
      >{{ risk }}</ElTag
    ><span v-if="!risks.length" class="text-g-500 text-xs">当前无异常</span></div
  >
</template>
<script setup lang="ts">
  defineProps<{ risks: string[] }>()
</script>
<style scoped>
  .risk-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .el-tag {
    max-width: 100%;
    height: auto;
    white-space: normal;
    padding: 3px 7px;
  }
</style>
