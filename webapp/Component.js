sap.ui.define([
    "sap/ui/core/UIComponent",
    "test/t1/test/inventory/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("test.t1.test.inventory.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            UIComponent.prototype.init.apply(this, arguments);
            this.setModel(models.createDeviceModel(), "device");
            this._ensureAppStylesheet();
        },

        _ensureAppStylesheet() {
            const sLinkId = "test.t1.test.inventory.style";
            const sModuleId = this.getManifestEntry("sap.app").id.replace(/\./g, "/");
            const sCssUrl = sap.ui.require.toUrl(sModuleId + "/css/style.css");

            if (!sCssUrl || document.getElementById(sLinkId)) {
                return;
            }

            const oLink = document.createElement("link");
            oLink.id = sLinkId;
            oLink.rel = "stylesheet";
            oLink.type = "text/css";
            oLink.href = sCssUrl;
            document.head.appendChild(oLink);
        }
    });
});