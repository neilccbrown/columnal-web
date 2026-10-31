<script setup lang="ts">
// Java: AboutDialog (dialogs-non-expression): the title and logo, and the version and system.
// PORT-NOTE: Java gave the operating system and the app's directory; here the browser.
import columnalImage from "@resources/gui/images/columnal.png";
import logoImage from "@resources/gui/images/logo.png";
import { t } from "../../i18n.js";
import { VERSION } from "../../version.js";
import LightDialog from "./LightDialog.vue";

const open = defineModel<boolean>("open", { required: true });
const info = t("about.version", VERSION) + "\n" + t("about.browser", navigator.userAgent) + "\n";
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('menu.help.about').replace('_', '')"
    :buttons="['close']"
    class="about-dialog"
  >
    <div class="logo-container">
      <img
        :src="columnalImage"
        alt="Columnal"
        class="title-image"
      >
      <img
        :src="logoImage"
        alt=""
        class="logo-image"
      >
    </div>
    <textarea
      class="about-info"
      readonly
      :value="info"
    />
  </LightDialog>
</template>

<style scoped>
.logo-container {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2.5em;
    padding: 1em 2.5em;
}
.title-image {
    height: 90px;
}
.logo-image {
    height: 100px;
}
.about-info {
    width: 100%;
    box-sizing: border-box;
    height: 6em;
    font-family: var(--font-main);
}
</style>
