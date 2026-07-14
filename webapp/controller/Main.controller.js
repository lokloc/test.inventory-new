sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("test.t1.test.inventory.controller.Main", {

        onInit: function () {
            this._aPlantMaster = [];

            var oHomeModel = new JSONModel({
                selectedNavKey: "home",
                viewMode: "grid",
                busy: false,
                company: {
                    mandt: "100",
                    bukrs: "1000",
                    butxt: "OLEUM",
                    land1: "KR",
                    ktopl: "KOR",
                    waers: "KRW",
                    stras: "서울 종로구 종로 26",
                    stcd1: "132-12-12345",
                    ernam: "NCODE-D-17",
                    erdat: "2006.01.01",
                    erzet: "09:49:03",
                    aenam: "",
                    aedat: "",
                    aezet: "00:00:00",
                    referenceDate: this._formatDate(new Date())
                },
                plants: []
            });

            this.getView().setModel(oHomeModel, "home");
            this._loadPlantData();
        },

        onAfterRendering: function () {
            this._bindMainSideNavigation();
        },

        onExit: function () {
            this._unbindMainSideNavigation();
        },

        _bindMainSideNavigation: function () {
            try {
                var oSideNav = this.byId("sideNavigation");

                if (!oSideNav) {
                    return;
                }

                if (!this._fnMainSideNavSelect) {
                    this._fnMainSideNavSelect = this.onSideNavItemSelect.bind(this);
                }

                if (oSideNav.attachItemSelect) {
                    oSideNav.detachItemSelect(this._fnMainSideNavSelect);
                    oSideNav.attachItemSelect(this._fnMainSideNavSelect);
                }

                var oNavList = oSideNav.getItem && oSideNav.getItem();

                if (oNavList && oNavList.getItems) {
                    oNavList.getItems().forEach(function (oNavItem) {
                        if (oNavItem.attachSelect) {
                            oNavItem.detachSelect(this._fnMainSideNavSelect);
                            oNavItem.attachSelect(this._fnMainSideNavSelect);
                        }
                    }.bind(this));
                }
            } catch (oError) {
                // Side nav binding must not block main view rendering.
            }
        },

        _unbindMainSideNavigation: function () {
            var oSideNav = this.byId("sideNavigation");

            if (!oSideNav || !this._fnMainSideNavSelect) {
                return;
            }

            oSideNav.detachItemSelect(this._fnMainSideNavSelect);

            var oNavList = oSideNav.getItem();

            if (oNavList) {
                oNavList.getItems().forEach(function (oNavItem) {
                    oNavItem.detachSelect(this._fnMainSideNavSelect);
                }.bind(this));
            }
        },

        onSideNavItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item") || oEvent.getSource();

            if (!oItem || !oItem.getKey) {
                return;
            }

            var sKey = oItem.getKey();

            if (!sKey) {
                return;
            }

            this.getView().getModel("home").setProperty("/selectedNavKey", sKey);

            if (sKey === "home") {
                return;
            }

            MessageToast.show("'" + oItem.getText() + "' 화면은 준비 중입니다.");
        },

        onSideNavCollapse: function () {
            var oToolPage = this.byId("toolPage");

            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onViewModeChange: function (oEvent) {
            var oItem = oEvent.getParameter("item");

            if (oItem) {
                this.getView().getModel("home").setProperty("/viewMode", oItem.getKey());
            }
        },

        onReferenceDateChange: function () {
            this._loadPlantData();
        },

        onRefreshPress: function () {
            this._loadPlantData(true);
        },

        onPlantNavigate: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            var oParent = oSource;

            while (!oContext && oParent) {
                oParent = oParent.getParent();
                oContext = oParent && oParent.getBindingContext();
            }

            var sWerks = oContext && oContext.getProperty("Werks");

            if (!sWerks && oContext) {
                sWerks = oContext.getProperty("werks") || oContext.getProperty("plantId");
            }

            if (!sWerks) {
                var oHomeContext = oSource.getBindingContext("home");

                if (oHomeContext) {
                    sWerks = oHomeContext.getProperty("werks") || oHomeContext.getProperty("Werks");
                }
            }

            if (!sWerks) {
                MessageToast.show("플랜트 정보를 찾을 수 없습니다.");
                return;
            }

            this.getOwnerComponent().getRouter().navTo("RouteTank", {
                werks: sWerks
            });
        },

        _buildPlantList: function (mMetrics) {
            mMetrics = mMetrics || {};

            return (this._aPlantMaster || []).map(function (oPlant) {
                var sKey = oPlant.Werks;
                var oMetrics = mMetrics[sKey] || { capacity: 0, currentInventory: 0 };

                return {
                    plantKey: sKey,
                    werks: sKey,
                    plantId: sKey,
                    plantName: oPlant.Name1,
                    planttype: oPlant.Planttype,
                    location: this._formatLocation(oPlant),
                    capacity: oMetrics.capacity,
                    currentInventory: oMetrics.currentInventory,
                    capacityUnit: "BBL"
                };
            }.bind(this));
        },

        _loadPlantData: function (bShowToast) {
            var oHomeModel = this.getView().getModel("home");
            var oODataModel = this.getView().getModel();

            if (!oODataModel) {
                return;
            }

            oHomeModel.setProperty("/busy", true);

            this._readEntitySet(oODataModel, "/plant_masterSet")
                .then(function (aPlantMaster) {
                    this._aPlantMaster = aPlantMaster;

                    return Promise.all([
                        this._readEntitySet(oODataModel, "/tankmasterSet").catch(function () {
                            return [];
                        }),
                        this._readEntitySet(oODataModel, "/tankstockSet").catch(function () {
                            return [];
                        })
                    ]);
                }.bind(this))
                .then(function (aResults) {
                    var mMetrics = this._aggregatePlantMetrics(aResults[0], aResults[1]);

                    oHomeModel.setProperty("/plants", this._buildPlantList(mMetrics));

                    if (bShowToast) {
                        MessageToast.show("플랜트 데이터를 새로고침했습니다.");
                    }
                }.bind(this))
                .catch(function () {
                    if (bShowToast) {
                        MessageToast.show("Gateway 연결 실패 — 플랜트 데이터를 불러오지 못했습니다.");
                    }
                })
                .finally(function () {
                    oHomeModel.setProperty("/busy", false);
                });

        },

        _readEntitySet: function (oModel, sPath) {
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    success: function (oData) {
                        resolve(oData.results || []);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            });
        },

        _aggregatePlantMetrics: function (aTankMaster, aTankStock) {
            var mCapacityByPlantKey = {};
            var mInventoryByPlantKey = {};

            aTankMaster.forEach(function (oTank) {
                var sPlantKey = this._resolvePlantKey(oTank.Werks, oTank.Lgort);

                if (!sPlantKey) {
                    return;
                }

                if (!mCapacityByPlantKey[sPlantKey]) {
                    mCapacityByPlantKey[sPlantKey] = 0;
                }

                mCapacityByPlantKey[sPlantKey] += parseFloat(oTank.Capicity) || 0;
            }.bind(this));

            aTankStock.forEach(function (oStock) {
                var sPlantKey = this._resolvePlantKey(oStock.Werks, oStock.Lgort);

                if (!sPlantKey) {
                    return;
                }

                if (!mInventoryByPlantKey[sPlantKey]) {
                    mInventoryByPlantKey[sPlantKey] = 0;
                }

                mInventoryByPlantKey[sPlantKey] += parseFloat(oStock.Quantity) || 0;
            }.bind(this));

            var mMetrics = {};

            (this._aPlantMaster || []).forEach(function (oPlant) {
                var sKey = oPlant.Werks;

                if (mCapacityByPlantKey[sKey] || mInventoryByPlantKey[sKey]) {
                    mMetrics[sKey] = {
                        capacity: mCapacityByPlantKey[sKey] || 0,
                        currentInventory: mInventoryByPlantKey[sKey] || 0
                    };
                }
            });

            return mMetrics;
        },

        _resolvePlantKey: function (sWerks, sLgort) {
            var aPlantMaster = this._aPlantMaster || [];
            var oByWerks = aPlantMaster.find(function (oPlant) {
                return oPlant.Werks === sWerks;
            });

            if (oByWerks) {
                return oByWerks.Werks;
            }

            var oByLgort = aPlantMaster.find(function (oPlant) {
                return oPlant.Werks === sLgort;
            });

            return oByLgort ? oByLgort.Werks : null;
        },

        _formatLocation: function (oPlant) {
            return [oPlant.Ort01, oPlant.Stras].filter(Boolean).join(", ");
        },

        _formatDate: function (oDate) {
            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");

            return sYear + "." + sMonth + "." + sDay;
        }
    });
});
