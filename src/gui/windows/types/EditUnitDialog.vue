<script setup lang="ts">
// Java: UnitsDialog.EditUnitDialog: a unit's name, and either a new unit (with a description, and
// optionally what it equals: a scale times a unit) or an alias for another unit.  The fields of the
// kind not chosen are disabled; a new unit has neither chosen.  The logic is in
// src/gui-logic/app/gui/UnitsDialog.ts.  (docs/gui-spec/types-and-units.md)
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { Localized, UnitIdentifier } from "../../../engine/anns/Annotations.js";
import { UnitExpression } from "../../../engine/expressions/transformations/expression/UnitExpressions.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import type { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { UnitsDialog } from "../../../gui-logic/app/gui/UnitsDialog.js";
import ErrorableLightDialog from "../../components/dialogs/ErrorableLightDialog.vue";
import ErrorLabel from "../../components/dialogs/ErrorLabel.vue";
import HelpBox from "../../components/HelpBox.vue";
import { t } from "../../i18n.js";
import UnitEditor from "../../lexeditor/UnitEditor.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
    typeManager: TypeManager,
    // The unit being edited, or null for a new one:
    initialValue: Pair<UnitIdentifier, UnitsDialog.UnitDef> | null,
}>();
const emit = defineEmits<{ ok: [unit: Pair<UnitIdentifier, UnitsDialog.UnitDef>] }>();

const name = shallowRef("");
const kind = shallowRef<"full" | "alias" | null>(null);
const aliasTarget = shallowRef("");
const description = shallowRef("");
const equivalent = shallowRef(false);
const scale = shallowRef("1");
const originalDefinition = shallowRef<UnitExpression | null>(null);
let definition: UnitExpression | null = null;
const generation = shallowRef(0);
const nameField = useTemplateRef<HTMLInputElement>("nameField");

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    generation.value += 1;
    const initial = props.initialValue;
    name.value = initial?.getFirst() ?? "";
    description.value = initial?.getSecond().either(() => "", d => d.getDefined().getDescription()) ?? "";
    const equiv = initial?.getSecond().either(() => null, d => d.getEquivalentTo()) ?? null;
    scale.value = equiv === null ? "1" : equiv.getFirst().toString();
    originalDefinition.value = equiv === null ? null : UnitExpression.load(equiv.getSecond());
    definition = originalDefinition.value;
    equivalent.value = equiv !== null;
    aliasTarget.value = initial?.getSecond().either(s => s, () => "") ?? "";
    // (If a new unit, leave it unselected)
    kind.value = initial === null ? null : initial.getSecond().isRight() ? "full" : "alias";
    // Java: setOnShown, focusing the name
    void nextTick(() => setTimeout(() => nameField.value?.focus()));
}, { immediate: true });

function setDefinition(u: UnitExpression): void
{
    definition = u;
}

// Java: updateEnabledState
const fullEnabled = computed(() => kind.value === "full");
const definedAsEnabled = computed(() => equivalent.value && fullEnabled.value);

function calculateResult(): Either<Localized, Pair<UnitIdentifier, UnitsDialog.UnitDef>>
{
    return UnitsDialog.calculateResult(props.typeManager.getUnitManager(), {
        name: name.value,
        kind: kind.value,
        aliasTarget: aliasTarget.value,
        description: description.value,
        equivalent: equivalent.value,
        scale: scale.value,
        // (The unit editor gives its content as it is made)
        definition: definition!,
    });
}
</script>

<template>
  <ErrorableLightDialog
    v-model:open="open"
    :label="t('units.edit.title')"
    buttons-to-side
    :calculate-result="calculateResult"
    @ok="unit => emit('ok', unit)"
  >
    <template #default="{ error, clearError }">
      <div
        :key="generation"
        class="edit-unit-dialog"
        @input="clearError()"
      >
        <div class="unit-row">
          <label class="name-label">{{ t("unit.name") }}</label>
          <HelpBox help-id="edit-unit/name" />
          <input
            ref="nameField"
            v-model="name"
            type="text"
            class="unit-name-field"
          >
        </div>
        <p class="unit-explanation">
          {{ t("unit.edit.explanation") }}
        </p>
        <div class="unit-choice">
          <label class="unit-radio">
            <input
              v-model="kind"
              type="radio"
              name="unit-kind"
              value="full"
              class="id-unit-full"
            >
            {{ t("unit.full") }}
          </label>
          <HelpBox help-id="edit-unit/full" />
        </div>
        <div
          class="full-detail-grid"
          :class="{ selected: kind === 'full' }"
        >
          <label :class="{ disabled: !fullEnabled }">{{ t("unit.full.description") }}</label>
          <HelpBox help-id="edit-unit/description" />
          <input
            v-model="description"
            type="text"
            class="unit-description-field"
            :disabled="!fullEnabled"
          >
          <label
            class="unit-tick"
            :class="{ disabled: !fullEnabled }"
          >
            <input
              v-model="equivalent"
              type="checkbox"
              class="unit-equivalent-tick"
              :disabled="!fullEnabled"
            >
            {{ t("unit.full.definition") }}
          </label>
          <HelpBox help-id="edit-unit/definition" />
          <div class="unit-definition">
            <input
              v-model="scale"
              type="text"
              class="unit-scale-field"
              :disabled="!definedAsEnabled"
            >
            <span> * </span>
            <div class="unit-definition-editor">
              <UnitEditor
                :type-manager="typeManager"
                :original-content="originalDefinition"
                :disabled="!definedAsEnabled"
                @change="setDefinition"
              />
            </div>
          </div>
        </div>
        <div class="unit-choice">
          <label class="unit-radio">
            <input
              v-model="kind"
              type="radio"
              name="unit-kind"
              value="alias"
              class="id-unit-alias"
            >
            {{ t("unit.alias") }}
          </label>
          <HelpBox help-id="edit-unit/alias" />
        </div>
        <div
          class="alias-detail-grid"
          :class="{ selected: kind === 'alias' }"
        >
          <label :class="{ disabled: kind !== 'alias' }">{{ t("unit.alias.target") }}</label>
          <HelpBox help-id="edit-unit/alias-target" />
          <input
            v-model="aliasTarget"
            type="text"
            class="unit-alias-target-field"
            :disabled="kind !== 'alias'"
          >
        </div>
        <ErrorLabel :error="error" />
      </div>
    </template>
  </ErrorableLightDialog>
</template>

<style scoped>
.edit-unit-dialog {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 520px;
}
.unit-row, .unit-choice {
    display: flex;
    align-items: center;
    gap: 4px;
}
.unit-row > input {
    flex: 1;
}
.unit-explanation {
    margin: 0;
}
/* Java: LabelledGrid, the details indented 40 px under their choice */
.full-detail-grid, .alias-detail-grid {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: center;
    gap: 4px;
    margin-left: 40px;
}
.unit-definition {
    display: flex;
    align-items: center;
    gap: 2px;
}
.unit-scale-field {
    width: 5em;
}
.unit-definition-editor {
    flex: 1;
    min-width: 0;
}
.disabled {
    opacity: 0.4;
}
</style>
