<script setup lang="ts">
// Component prototype (Phase 7, throwaway): four components built with Reka UI (Ark UI versions were
// compared, then removed).  Open /src/gui/prototype/components/ on the dev server.
import { shallowRef } from "vue";
import RekaTooltip from "./reka/AbbrevTooltip.vue";
import RekaMenu from "./reka/ColumnContextMenu.vue";
import RekaDialog from "./reka/LightDialog.vue";
import RekaCombobox from "./reka/PickTableCombobox.vue";

const tables = ["Test 0", "Trans 1", "Trans 2", "Trans 3", "Trans 4", "Trans 5", "Big", "Big calc", "Prices", "Prices by month", "Österreich"];
const longName = "A column with a very long name that does not fit";

const sides = [
    { id: "reka", title: "Reka UI", Dialog: RekaDialog, Menu: RekaMenu, Tooltip: RekaTooltip, Combobox: RekaCombobox },
] as const;
const open = shallowRef<Record<string, boolean>>({ reka: false });
const picked = shallowRef<Record<string, string | undefined>>({ reka: undefined });
const log = shallowRef<Record<string, string[]>>({ reka: [] });

function record(side: string, what: string): void
{
    log.value = { ...log.value, [side]: [...log.value[side]!, what] };
}
</script>

<template>
  <div class="demo">
    <section
      v-for="s in sides"
      :key="s.id"
      :data-testid="s.id"
    >
      <h2>{{ s.title }}</h2>
      <p>
        <button
          data-testid="open-dialog"
          @click="open = { ...open, [s.id]: true }"
        >
          Open dialog
        </button>
      </p>
      <component
        :is="s.Dialog"
        :open="open[s.id]!"
        title="New column"
        @update:open="(v: boolean) => open = { ...open, [s.id]: v }"
        @ok="record(s.id, 'dialog OK')"
      >
        <label>Name <input data-testid="dialog-input"></label>
      </component>
      <component
        :is="s.Menu"
        @select="(a: string) => record(s.id, 'menu ' + a)"
      >
        <div
          class="column-header"
          data-testid="column-header"
        >
          <component
            :is="s.Tooltip"
            :text="longName"
          />
        </div>
      </component>
      <p>
        <component
          :is="s.Combobox"
          :model-value="picked[s.id]"
          :tables="tables"
          @update:model-value="(v: string | undefined) => { picked = { ...picked, [s.id]: v }; record(s.id, 'picked ' + v); }"
        />
      </p>
      <ol data-testid="log">
        <li
          v-for="(l, i) in log[s.id]"
          :key="i"
        >
          {{ l }}
        </li>
      </ol>
    </section>
  </div>
</template>

<style>
@import "../../styles/fonts.css";
@import "../../styles/tokens.css";
@import "./components.css";

body {
    margin: 0;
    font-family: var(--font-main);
    background: var(--pane-background);
    color: var(--text-color);
}
</style>

<style scoped>
.demo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    padding: 16px;
}
.column-header {
    width: 180px;
    height: 24px;
    line-height: 24px;
    padding: 0 2px;
    background: var(--column-header-background-color);
    color: var(--column-header-text-color);
}
.column-header :deep(.abbrev-label) {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}
</style>
