sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/f/library"
], function (Controller, JSONModel, fioriLibrary) {
    "use strict";

    var LayoutType = fioriLibrary.LayoutType;

    return Controller.extend("test.t1.test.inventory.controller.App", {

        onInit: function () {
            var oAppViewModel = new JSONModel({
                layout: LayoutType.OneColumn
            });

            this.getView().setModel(oAppViewModel, "appView");
            this._oRouter = this.getOwnerComponent().getRouter();
            this._oRouter.attachRouteMatched(this._onRouteMatched, this);
            this._oRouter.initialize();
        },

        _onRouteMatched: function () {
            this.getView().getModel("appView").setProperty("/layout", LayoutType.OneColumn);
        }
    });
});
