sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/VBox",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/FlexBox",
    "sap/suite/ui/microchart/InteractiveDonutChart",
    "sap/suite/ui/microchart/InteractiveDonutChartSegment",
    "sap/ui/core/Fragment"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageToast,
    VBox,
    Title,
    Text,
    FlexBox,
    InteractiveDonutChart,
    InteractiveDonutChartSegment,
    Fragment
) {
    "use strict";

    var PAGE_SIZE = 10;
    var TANKS_PER_ZONE = 35;

    var STATUS_MAP = {
        E: {
            text: "빈 탱크",
            state: "None",
            icon: "sap-icon://circle-task-2",
            color: "#B8BDC3",
            levelState: "None"
        },
        A: {
            text: "가용재고",
            state: "Success",
            icon: "sap-icon://status-positive",
            color: "#2E7D32",
            levelState: "Success"
        },
        P: {
            text: "품질검사대기",
            state: "Warning",
            icon: "sap-icon://inspect",
            color: "#EF6C00",
            levelState: "Warning"
        },
        I: {
            text: "입고 중",
            state: "Information",
            icon: "sap-icon://shipping-status",
            color: "#1976D2",
            levelState: "Information"
        },
        F: {
            text: "품질 검사 실패",
            state: "Error",
            icon: "sap-icon://status-error",
            color: "#D32F2F",
            levelState: "Error"
        },
        R: {
            text: "예약탱크(입고예정)",
            state: "None",
            icon: "sap-icon://appointment",
            color: "#6A1B9A",
            levelState: "None"
        }
    };

    var TANK_SVG_COLORS = {
        E: { body: "#B8BEC6", bodyDark: "#939AA4", rim: "#D5DAE1", stroke: "#4D535A" },
        A: { body: "#2E7D32", bodyDark: "#1B5E20", rim: "#56A85A", stroke: "#1B5E20" },
        I: { body: "#1976D2", bodyDark: "#1256A8", rim: "#4FA3F7", stroke: "#0D47A1" },
        P: { body: "#EF6C00", bodyDark: "#C55600", rim: "#FF9838", stroke: "#BF360C" },
        F: { body: "#D32F2F", bodyDark: "#B71C1C", rim: "#EF5350", stroke: "#C62828" },
        R: { body: "#6A1B9A", bodyDark: "#4A148C", rim: "#8E24AA", stroke: "#4A148C" }
    };

    var STATUS_LEGEND_ORDER = ["E", "A", "P", "I", "F", "R"];
    var TANK_MAP_EVENT_CHANNEL = "test.inventory.tankMap";
    var TANK_MAP_EVENT_PRESS = "press";
    var mTankListStateByWerks = {};

    return Controller.extend("test.t1.test.inventory.controller.Tank", {

        onInit: function () {
            this._sWerks = "";
            this._aAllTanks = [];
            this._aFilteredTanks = [];
            this._oStatusLegendDialog = null;
            this._bStatusLegendDialogLoaded = false;
            var oTankModel = new JSONModel({
                busy: false,
                viewMode: "map",
                search: "",
                areaFilter: "ALL",
                selectedTab: "tankStatus",
                selectedNavKey: "home",
                plant: {
                    werks: "",
                    plantId: "",
                    plantName: "",
                    location: ""
                },
                summary: {
                    totalTanks: 0,
                    totalCapacity: 0,
                    currentInventory: 0,
                    availableCapacity: 0,
                    unit: "BBL"
                },
                zoneDonutCharts: [],
                tankAreas: [],
                displayTanks: [],
                statusLegendItems: this._buildStatusLegendItems(),
                pagination: {
                    currentPage: 1,
                    pageSize: PAGE_SIZE,
                    totalItems: 0,
                    totalPages: 1,
                    rangeText: "0 / 0",
                    hasPrev: false,
                    hasNext: false
                }
            });

            this.getView().setModel(oTankModel, "tank");
            this._oEventBus = sap.ui.getCore().getEventBus();
            this._oEventBus.subscribe(
                TANK_MAP_EVENT_CHANNEL,
                TANK_MAP_EVENT_PRESS,
                this._onTankMapItemPress,
                this
            );
            this._fnTankMapDomClick = this._handleTankMapDomClick.bind(this);
            this.getOwnerComponent().getRouter()
                .getRoute("RouteTank")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onAfterRendering: function () {
            this._renderZoneDonutCharts();
            this._ensureTankMapDomClick();
            this._attachTankMapHtmlClicks();
            window.setTimeout(function () {
                this._bindTankSideNavigation();
            }.bind(this), 0);
        },

        onExit: function () {
            this._unbindTankSideNavigation();
            this._removeTankMapDomClick();

            if (this._oStatusLegendDialog) {
                this._oStatusLegendDialog.destroy();
                this._oStatusLegendDialog = null;
            }

            this._bStatusLegendDialogLoaded = false;

            if (this._oEventBus) {
                this._oEventBus.unsubscribe(
                    TANK_MAP_EVENT_CHANNEL,
                    TANK_MAP_EVENT_PRESS,
                    this._onTankMapItemPress,
                    this
                );
            }
        },

        _onRouteMatched: function (oEvent) {
            var sWerks = oEvent.getParameter("arguments").werks || "";
            var oSavedState = mTankListStateByWerks[sWerks];

            this._sWerks = sWerks;
            this.getView().getModel("tank").setProperty("/plant/werks", this._sWerks);
            window.setTimeout(function () {
                this._bindTankSideNavigation();
            }.bind(this), 0);

            if (oSavedState) {
                this._restoreTankListModelState(oSavedState);
                this._bRestoreListState = true;
                this._oPendingListRestore = oSavedState;

                if (this._aAllTanks.length > 0) {
                    this._applyFilters(false);
                    this._finishTankListRestore();
                    return;
                }

                this._loadTankData();
                return;
            }

            this._bRestoreListState = false;
            this._oPendingListRestore = null;
            this.getView().getModel("tank").setProperty("/pagination/currentPage", 1);
            this._loadTankData();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain");
        },

        onSideNavItemSelect: function (oEvent) {
            var oItem = oEvent.getParameter("item") || oEvent.getSource();
            this._activateTankSideNavItem(oItem);
        },

        _activateTankSideNavItem: function (oItem) {
            if (!oItem || !oItem.getKey) {
                return;
            }

            var sKey = oItem.getKey();

            if (!sKey) {
                return;
            }

            var fNow = Date.now();

            if (this._sLastTankNavKey === sKey && fNow - (this._fLastTankNavAt || 0) < 250) {
                return;
            }

            this._sLastTankNavKey = sKey;
            this._fLastTankNavAt = fNow;

            var oTankModel = this.getView().getModel("tank");

            if (oTankModel) {
                oTankModel.setProperty("/selectedNavKey", sKey);
            }

            if (sKey === "home") {
                this.getOwnerComponent().getRouter().navTo("RouteMain");
                return;
            }

            MessageToast.show("'" + oItem.getText() + "' 화면은 준비 중입니다.");
        },

        _bindTankSideNavigation: function () {
            try {
                var oSideNav = this.byId("tankSideNavigation");

                if (!oSideNav) {
                    return;
                }

                var oToolPage = this.byId("tankToolPage");

                if (oToolPage && oToolPage.setSideExpanded) {
                    oToolPage.setSideExpanded(true);
                }

                if (!this._fnTankSideNavSelect) {
                    this._fnTankSideNavSelect = this.onSideNavItemSelect.bind(this);
                }

                if (oSideNav.attachItemSelect) {
                    oSideNav.detachItemSelect(this._fnTankSideNavSelect);
                    oSideNav.attachItemSelect(this._fnTankSideNavSelect);
                }

                var oNavList = oSideNav.getItem && oSideNav.getItem();

                if (!oNavList && oSideNav.getAggregation) {
                    oNavList = oSideNav.getAggregation("item");
                }

                if (oNavList && oNavList.getItems) {
                    oNavList.getItems().forEach(function (oNavItem) {
                        if (oNavItem.attachSelect) {
                            oNavItem.detachSelect(this._fnTankSideNavSelect);
                            oNavItem.attachSelect(this._fnTankSideNavSelect);
                        }
                    }.bind(this));
                }

                this._bindTankSideNavigationDom(oSideNav);
            } catch (oError) {
                // Side nav binding must not block tank view rendering.
            }
        },

        _bindTankSideNavigationDom: function (oSideNav) {
            var oDom = oSideNav.getDomRef();

            if (!oDom) {
                return;
            }

            if (!this._fnTankSideNavDomClick) {
                this._fnTankSideNavDomClick = function (oEvent) {
                    var oNav = this.byId("tankSideNavigation");
                    var oList = oNav && oNav.getItem && oNav.getItem();

                    if (!oList && oNav && oNav.getAggregation) {
                        oList = oNav.getAggregation("item");
                    }

                    if (!oList || !oList.getItems) {
                        return;
                    }

                    var aItems = oList.getItems();

                    for (var i = 0; i < aItems.length; i++) {
                        var oNavItem = aItems[i];
                        var oItemDom = oNavItem.getDomRef && oNavItem.getDomRef();

                        if (oItemDom && oItemDom.contains(oEvent.target)) {
                            this._activateTankSideNavItem(oNavItem);
                            return;
                        }
                    }
                }.bind(this);
            }

            oDom.removeEventListener("click", this._fnTankSideNavDomClick);
            oDom.addEventListener("click", this._fnTankSideNavDomClick);
        },

        _unbindTankSideNavigation: function () {
            var oSideNav = this.byId("tankSideNavigation");

            if (!oSideNav) {
                return;
            }

            if (this._fnTankSideNavDomClick) {
                var oDom = oSideNav.getDomRef();

                if (oDom) {
                    oDom.removeEventListener("click", this._fnTankSideNavDomClick);
                }
            }

            if (!this._fnTankSideNavSelect) {
                return;
            }

            oSideNav.detachItemSelect(this._fnTankSideNavSelect);

            var oNavList = oSideNav.getItem();

            if (oNavList) {
                oNavList.getItems().forEach(function (oNavItem) {
                    oNavItem.detachSelect(this._fnTankSideNavSelect);
                }.bind(this));
            }
        },

        onHomeBreadcrumbPress: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMain");
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");

            this.getView().getModel("tank").setProperty("/selectedTab", sKey);
        },

        onViewModeChange: function (oEvent) {
            var oItem = oEvent.getParameter("item");

            if (oItem) {
                this.getView().getModel("tank").setProperty("/viewMode", oItem.getKey());

                if (oItem.getKey() === "map") {
                    setTimeout(function () {
                        this._ensureTankMapDomClick();
                        this._attachTankMapHtmlClicks();
                    }.bind(this), 100);
                }
            }
        },

        onSearchChange: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || "";

            this.getView().getModel("tank").setProperty("/search", sQuery);
            this._applyFilters();
        },

        onAreaFilterChange: function (oEvent) {
            var sArea = oEvent.getParameter("selectedItem").getKey();

            this.getView().getModel("tank").setProperty("/areaFilter", sArea);
            this._applyFilters();
        },

        onRefreshPress: function () {
            this._loadTankData(true);
        },

        onTableFirstPage: function () {
            this._goToTablePage(1);
        },

        onTablePrevPage: function () {
            var iCurrentPage = this.getView().getModel("tank").getProperty("/pagination/currentPage") || 1;

            this._goToTablePage(Math.max(iCurrentPage - 1, 1));
        },

        onTableNextPage: function () {
            var oTankModel = this.getView().getModel("tank");
            var iCurrentPage = oTankModel.getProperty("/pagination/currentPage") || 1;
            var iTotalPages = oTankModel.getProperty("/pagination/totalPages") || 1;

            this._goToTablePage(Math.min(iCurrentPage + 1, iTotalPages));
        },

        onTableLastPage: function () {
            var iTotalPages = this.getView().getModel("tank").getProperty("/pagination/totalPages") || 1;

            this._goToTablePage(iTotalPages);
        },

        onTablePageSizeChange: function (oEvent) {
            var iPageSize = parseInt(oEvent.getParameter("selectedItem").getKey(), 10) || PAGE_SIZE;

            this.getView().getModel("tank").setProperty("/pagination/pageSize", iPageSize);
            this._goToTablePage(1);
        },

        _goToTablePage: function (iPage) {
            this.getView().getModel("tank").setProperty("/pagination/currentPage", iPage);
            this._updateDisplayTanks();
        },

        onTankRowClick: function (oEvent) {
            var oTank = this._getTankFromEvent(oEvent);

            if (oTank) {
                this._navigateToTankDetail(oTank.tankId);
            }
        },

        onTankMapItemPress: function (oEvent) {
            var oTank = this._getTankFromEvent(oEvent);

            if (oTank) {
                this._navigateToTankDetail(oTank.tankId);
            }
        },

        _onTankMapItemPress: function (sChannel, sEvent, oData) {
            if (oData && oData.tankId) {
                this._navigateToTankDetail(oData.tankId);
            }
        },

        _ensureTankMapDomClick: function () {
            var oCanvas = this.byId("tankMapCanvas");
            var oDom = oCanvas && oCanvas.getDomRef();

            if (!oDom || this._bTankMapDomDelegated) {
                return;
            }

            oDom.addEventListener("click", this._fnTankMapDomClick);
            this._bTankMapDomDelegated = true;
        },

        _removeTankMapDomClick: function () {
            var oCanvas = this.byId("tankMapCanvas");
            var oDom = oCanvas && oCanvas.getDomRef();

            if (oDom && this._fnTankMapDomClick) {
                oDom.removeEventListener("click", this._fnTankMapDomClick);
            }

            this._bTankMapDomDelegated = false;
        },

        _handleTankMapDomClick: function (oEvent) {
            var oCanvas = this.byId("tankMapCanvas");
            var oCanvasDom = oCanvas && oCanvas.getDomRef();
            var oTarget = oEvent.target;

            if (!oCanvasDom || !oTarget) {
                return;
            }

            if (!oTarget.closest) {
                return;
            }

            var oTankEl = oTarget.closest("[data-tank-id]");

            if (!oTankEl) {
                return;
            }

            var sTankId = oTankEl.getAttribute("data-tank-id");

            if (sTankId && sTankId.indexOf("legend-") !== 0) {
                this._navigateToTankDetail(sTankId);
            }
        },

        _attachTankMapHtmlClicks: function () {
            var oCanvas = this.byId("tankMapCanvas");

            if (!oCanvas) {
                return;
            }

            oCanvas.findAggregatedObjects(true, function (oControl) {
                return oControl.isA("sap.ui.core.HTML");
            }).forEach(function (oHtml) {
                if (oHtml.data("tankMapClickBound")) {
                    return;
                }

                oHtml.attachBrowserEvent("click", function (oEvent) {
                    var oTarget = oEvent.target;

                    if (!oTarget || !oTarget.closest) {
                        return;
                    }

                    var oTankEl = oTarget.closest("[data-tank-id]");

                    if (!oTankEl) {
                        return;
                    }

                    var sTankId = oTankEl.getAttribute("data-tank-id");

                    if (sTankId && sTankId.indexOf("legend-") !== 0) {
                        this._navigateToTankDetail(sTankId);
                    }
                }.bind(this));
                oHtml.data("tankMapClickBound", true);
            }.bind(this));
        },

        _getTankFromEvent: function (oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext("tank");
            var oParent = oSource;

            while (!oContext && oParent) {
                oParent = oParent.getParent();
                oContext = oParent && oParent.getBindingContext("tank");
            }

            return oContext && oContext.getObject();
        },

        _navigateToTankDetail: function (sTankId) {
            if (!sTankId || !this._sWerks) {
                return;
            }

            this._saveTankListState();
            this.getOwnerComponent().getRouter().navTo("RouteTankDetail", {
                werks: this._sWerks,
                lgort: sTankId
            });
        },

        onCreateAuditPress: function () {
            MessageToast.show("실사 생성 기능은 준비 중입니다.");
        },

        onStatusLegendPress: function () {
            this._openStatusLegendDialog();
        },

        onStatusLegendClose: function () {
            this._closeStatusLegendDialog();
        },

        _loadStatusLegendDialog: function () {
            if (this._bStatusLegendDialogLoaded) {
                return Promise.resolve(this._oStatusLegendDialog);
            }

            return Fragment.load({
                id: this.getView().getId(),
                name: "test.t1.test.inventory.view.fragments.StatusLegendDialog",
                controller: this
            }).then(function (oDialog) {
                this._oStatusLegendDialog = oDialog;
                this.getView().addDependent(oDialog);
                this._bStatusLegendDialogLoaded = true;
                return oDialog;
            }.bind(this));
        },

        _openStatusLegendDialog: function () {
            return this._loadStatusLegendDialog().then(function (oDialog) {
                oDialog.open();
            });
        },

        _closeStatusLegendDialog: function () {
            if (this._oStatusLegendDialog) {
                this._oStatusLegendDialog.close();
            }
        },

        _loadTankData: function (bShowToast) {
            var oTankModel = this.getView().getModel("tank");
            var oODataModel = this.getView().getModel();

            if (!oODataModel || !this._sWerks) {
                return;
            }

            oTankModel.setProperty("/busy", true);

            Promise.all([
                this._readPlantMaster(oODataModel, this._sWerks),
                this._readEntitySet(oODataModel, "/tankmasterSet", [
                    new Filter("Werks", FilterOperator.EQ, this._sWerks)
                ]),
                this._readEntitySet(oODataModel, "/tankstockSet", [
                    new Filter("Werks", FilterOperator.EQ, this._sWerks)
                ])
            ])
                .then(function (aResults) {
                    var oPlant = aResults[0];
                    var aTankMaster = aResults[1];
                    var aTankStock = aResults[2];
                    var mStockByKey = this._mapStockByTank(aTankStock);

                    this._aAllTanks = aTankMaster
                        .filter(function (oTank) {
                            return !this._isHarborTank(oTank.Lgort);
                        }.bind(this))
                        .map(function (oTank) {
                            return this._buildTankItem(oTank, mStockByKey);
                        }.bind(this))
                        .sort(this._compareTankNumber);

                    this._setPlantInfo(oPlant);
                    this._updateSummary(this._aAllTanks);

                    if (this._bRestoreListState) {
                        this._applyFilters(false);
                        this._finishTankListRestore();
                    } else {
                        this._applyFilters();
                    }

                    if (bShowToast) {
                        MessageToast.show("탱크 데이터를 새로고침했습니다.");
                    }
                }.bind(this))
                .catch(function () {
                    if (bShowToast) {
                        MessageToast.show("탱크 데이터를 불러오지 못했습니다.");
                    }
                })
                .finally(function () {
                    oTankModel.setProperty("/busy", false);
                });
        },

        _readPlantMaster: function (oModel, sWerks) {
            return new Promise(function (resolve, reject) {
                oModel.read("/plant_masterSet('" + sWerks + "')", {
                    success: function (oData) {
                        resolve(oData);
                    },
                    error: function () {
                        oModel.read("/plant_masterSet", {
                            filters: [new Filter("Werks", FilterOperator.EQ, sWerks)],
                            success: function (oData) {
                                resolve((oData.results || [])[0] || {});
                            },
                            error: reject
                        });
                    }
                });
            });
        },

        _readEntitySet: function (oModel, sPath, aFilters) {
            return new Promise(function (resolve, reject) {
                oModel.read(sPath, {
                    filters: aFilters || [],
                    success: function (oData) {
                        resolve(oData.results || []);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            });
        },

        _mapStockByTank: function (aTankStock) {
            var mStock = {};

            aTankStock.forEach(function (oStock) {
                var sKey = this._buildStockKey(oStock.Werks, oStock.Lgort, oStock.Matnr);

                mStock[sKey] = oStock;
            }.bind(this));

            return mStock;
        },

        _buildStockKey: function (sWerks, sLgort, sMatnr) {
            return [sWerks, sLgort, sMatnr].join("|");
        },

        _buildTankItem: function (oTank, mStockByKey) {
            var sMatnr = (oTank.Matnr || "").trim();
            var fCapacity = parseFloat(oTank.Capicity) || 0;
            var oStock = sMatnr
                ? mStockByKey[this._buildStockKey(oTank.Werks, oTank.Lgort, sMatnr)]
                : null;
            var fInventory = sMatnr && oStock ? parseFloat(oStock.Quantity) || 0 : 0;

            fInventory = this._roundTo3(fInventory);
            var fLevel = fCapacity > 0 ? (fInventory / fCapacity) * 100 : 0;
            var oStatus = this._resolveStatus(oTank.Stat);
            var fTemperature = oStock ? parseFloat(oStock.TempV) || 0 : 0;
            var oArea = this._resolveTankArea(oTank.Lgort);

            return {
                rowKey: oTank.Werks + "|" + oTank.Lgort,
                tankId: oTank.Lgort,
                tankName: oTank.Tname || oTank.Lgort,
                areaKey: oArea.key,
                areaLabel: oArea.label,
                product: sMatnr || "-",
                capacity: fCapacity,
                currentInventory: fInventory,
                level: Math.round(fLevel * 10) / 10,
                levelText: fLevel.toFixed(1) + "%",
                temperature: fTemperature,
                temperatureText: fTemperature ? fTemperature.toFixed(1) + " °C" : "-",
                statusCode: oStatus.code,
                status: oStatus.text,
                statusState: oStatus.state,
                statusIcon: oStatus.icon,
                statusColor: oStatus.color,
                levelState: oStatus.levelState,
                tankNo: parseInt(oTank.Lgort, 10) || 0,
                lastCountDate: this._formatODataDate(oTank.Erdat),
                werks: oTank.Werks,
                lgort: oTank.Lgort,
                matnr: sMatnr,
                hasStock: !!sMatnr
            };
        },

        _isHarborTank: function (sTankId) {
            var nTankNo = parseInt(sTankId, 10);

            return !isNaN(nTankNo) && nTankNo >= 9000 && nTankNo < 10000;
        },

        _resolveTankArea: function (sTankId) {
            var nTankNo = parseInt(sTankId, 10);

            if (isNaN(nTankNo)) {
                return { key: "OTHER", label: "기타" };
            }

            if (nTankNo >= 1000 && nTankNo < 2000) {
                return { key: "1000", label: "1000번대" };
            }

            if (nTankNo >= 2000 && nTankNo < 3000) {
                return { key: "2000", label: "2000번대" };
            }

            if (nTankNo >= 3000 && nTankNo < 4000) {
                return { key: "3000", label: "3000번대" };
            }

            return { key: "OTHER", label: "기타" };
        },

        _resolveStatus: function (sStat) {
            var sCode = sStat === null || sStat === undefined ? "" : String(sStat).trim().toUpperCase();

            if (!sCode || sCode === "NULL") {
                sCode = "E";
            }

            var oStatus = STATUS_MAP[sCode];

            if (oStatus) {
                return Object.assign({ code: sCode }, oStatus);
            }

            return Object.assign({ code: "E" }, STATUS_MAP.E);
        },

        _compareTankNumber: function (oLeft, oRight) {
            return oLeft.tankNo - oRight.tankNo;
        },

        _setPlantInfo: function (oPlant) {
            var oTankModel = this.getView().getModel("tank");
            var sLocation = [oPlant.Ort01, oPlant.Stras].filter(Boolean).join(", ");

            oTankModel.setProperty("/plant", {
                werks: this._sWerks,
                plantId: this._sWerks,
                plantName: oPlant.Name1 || this._sWerks,
                location: sLocation
            });
        },

        _updateSummary: function (aTanks) {
            var fTotalCapacity = 0;
            var fCurrentInventory = 0;

            aTanks.forEach(function (oTank) {
                fTotalCapacity += oTank.capacity;
                fCurrentInventory += oTank.currentInventory;
            });

            fCurrentInventory = this._roundTo3(fCurrentInventory);

            this.getView().getModel("tank").setProperty("/summary", {
                totalTanks: aTanks.length,
                totalCapacity: this._roundTo3(fTotalCapacity),
                currentInventory: fCurrentInventory,
                availableCapacity: this._roundTo3(Math.max(fTotalCapacity - fCurrentInventory, 0)),
                unit: "BBL"
            });
            this.getView().getModel("tank").setProperty("/zoneDonutCharts", this._buildZoneDonutCharts(aTanks));
            this._renderZoneDonutCharts();
        },

        _renderZoneDonutCharts: function () {
            var oRow = this.byId("zoneDonutRow");

            if (!oRow) {
                return;
            }

            try {
                oRow.destroyItems();

                var aZoneCharts = this.getView().getModel("tank").getProperty("/zoneDonutCharts") || [];

                aZoneCharts.forEach(function (oZone) {
                    var oCard = new VBox({
                        items: [
                            new Title({
                                text: oZone.zoneLabel,
                                level: "H5"
                            }).addStyleClass("tankZoneDonutTitle"),
                            new Text({
                                text: "총 " + oZone.totalTanks + "기 탱크"
                            }).addStyleClass("tankZoneDonutSub sapUiTinyMarginTop"),
                            new FlexBox({
                                alignItems: "Center",
                                justifyContent: "Center",
                                height: "11rem",
                                width: "100%",
                                items: [this._createZoneDonutChart(oZone)]
                            }).addStyleClass("tankZoneDonutFlex sapUiSmallMarginTop")
                        ]
                    }).addStyleClass("tankZoneDonutCard");

                    oRow.addItem(oCard);
                }.bind(this));
            } catch (oError) {
                // Donut chart rendering must not block the tank page.
            }
        },

        _createZoneDonutChart: function (oZone) {
            var aSegments = oZone.segments || [];
            var oChart = new InteractiveDonutChart({
                displayedSegments: Math.max(aSegments.length, 1),
                selectionEnabled: false
            });

            aSegments.forEach(function (oSegment) {
                oChart.addSegment(new InteractiveDonutChartSegment({
                    label: oSegment.label,
                    value: oSegment.value,
                    displayedValue: oSegment.displayedValue,
                    color: oSegment.color
                }));
            });

            return oChart;
        },

        _buildZoneDonutCharts: function (aTanks) {
            var aZoneOrder = [
                { key: "1000", label: "원유 저장" },
                { key: "2000", label: "생산 공정" },
                { key: "3000", label: "제품 출하" }
            ];
            var aDonutGroups = [
                { key: "A", label: STATUS_MAP.A.text, color: "Good" },
                { key: "E", label: STATUS_MAP.E.text, color: "Neutral" },
                { key: "OTHER", label: "기타", color: "Critical" }
            ];

            return aZoneOrder.map(function (oZone) {
                var aZoneTanks = aTanks.filter(function (oTank) {
                    return oTank.areaKey === oZone.key;
                });
                var mStatusCounts = {};

                aZoneTanks.forEach(function (oTank) {
                    var sCode = oTank.statusCode || "E";

                    mStatusCounts[sCode] = (mStatusCounts[sCode] || 0) + 1;
                });

                var iTotal = aZoneTanks.length;
                var iOtherCount = 0;

                Object.keys(mStatusCounts).forEach(function (sCode) {
                    if (sCode !== "E" && sCode !== "A") {
                        iOtherCount += mStatusCounts[sCode];
                    }
                });

                var mGroupCounts = {
                    E: mStatusCounts.E || 0,
                    A: mStatusCounts.A || 0,
                    OTHER: iOtherCount
                };
                var aSegments = aDonutGroups
                    .filter(function (oGroup) {
                        return mGroupCounts[oGroup.key] > 0;
                    })
                    .map(function (oGroup) {
                        var iCount = mGroupCounts[oGroup.key];
                        var fPercent = iTotal > 0 ? (iCount / iTotal) * 100 : 0;

                        return {
                            label: oGroup.label,
                            value: iCount,
                            displayedValue: fPercent.toFixed(0) + "%",
                            color: oGroup.color
                        };
                    });

                if (!aSegments.length) {
                    aSegments.push({
                        label: "탱크 없음",
                        value: 1,
                        displayedValue: "0%",
                        color: "Neutral"
                    });
                }

                return {
                    zoneKey: oZone.key,
                    zoneLabel: oZone.label,
                    totalTanks: iTotal,
                    displayedSegments: aSegments.length,
                    segments: aSegments
                };
            });
        },

        _roundTo3: function (fValue) {
            return Math.round((parseFloat(fValue) || 0) * 1000) / 1000;
        },

        _updateTankAreaMap: function (aTanks) {
            var aAreaOrder = ["1000", "2000", "3000", "OTHER"];
            var mTanksByArea = {};
            var aAreas = [];
            var iZoneIndex = 0;

            aTanks.forEach(function (oTank) {
                var sAreaKey = oTank.areaKey || "OTHER";

                if (!mTanksByArea[sAreaKey]) {
                    mTanksByArea[sAreaKey] = [];
                }

                mTanksByArea[sAreaKey].push(oTank);
            });

            aAreaOrder.forEach(function (sAreaKey) {
                var aAreaTanks = (mTanksByArea[sAreaKey] || []).slice().sort(this._compareTankNumber);
                var iZoneInGroup = 0;

                for (var i = 0; i < aAreaTanks.length; i += TANKS_PER_ZONE) {
                    var aChunk = aAreaTanks.slice(i, i + TANKS_PER_ZONE);
                    var sFirst = aChunk[0] ? aChunk[0].tankId : "";
                    var sLast = aChunk[aChunk.length - 1] ? aChunk[aChunk.length - 1].tankId : "";

                    aAreas.push({
                        areaKey: String(iZoneIndex + 1),
                        areaGroup: sAreaKey,
                        areaGroupLabel: aChunk[0] ? aChunk[0].areaLabel : "",
                        areaLabel: this._getZoneLabel(sAreaKey, iZoneInGroup),
                        areaRange: sFirst && sLast ? sFirst + " ~ " + sLast : "",
                        tankCount: aChunk.length,
                        rows: this._chunkTanksIntoRows(aChunk.map(this._mapTankForDisplay, this), 7)
                    });

                    iZoneInGroup++;
                    iZoneIndex++;
                }
            }.bind(this));

            this.getView().getModel("tank").setProperty("/tankAreas", aAreas);
            setTimeout(function () {
                this._ensureTankMapDomClick();
                this._attachTankMapHtmlClicks();
            }.bind(this), 100);
        },

        _mapTankForDisplay: function (oTank) {
            var sStatusCode = oTank.statusCode || "E";

            return {
                tankId: oTank.tankId,
                tankNo: oTank.tankNo,
                status: oTank.status,
                statusCode: sStatusCode,
                statusColor: oTank.statusColor,
                tooltipText: oTank.tankId + " - " + oTank.status,
                cylinderHtml: this._buildTankIconHtml(sStatusCode, oTank.tankId + " - " + oTank.status, oTank.tankId),
                isEmpty: false
            };
        },

        _buildStatusLegendItems: function () {
            return STATUS_LEGEND_ORDER.map(function (sCode) {
                var oStatus = STATUS_MAP[sCode];

                return {
                    code: sCode,
                    label: sCode + "  " + oStatus.text,
                    iconHtml: this._buildTankIconHtml(sCode, "", "legend-" + sCode, true)
                };
            }.bind(this));
        },

        _buildTankIconHtml: function (sStatusCode, sTooltip, sUniqueId, bLegend) {
            var oColors = TANK_SVG_COLORS[sStatusCode] || TANK_SVG_COLORS.E;
            var sTitle = String(sTooltip || "").replace(/"/g, "'");
            var sGradId = "tankGrad-" + String(sUniqueId || sStatusCode).replace(/[^a-zA-Z0-9_-]/g, "");
            var sWrapClass = bLegend ? "tankIconWrap tankLegendIconWrap" : "tankIconWrap tankMapIconClickable";
            var sSvgClass = bLegend ? "tankSvgIcon tankLegendSvgIcon" : "tankSvgIcon";
            var sTankIdAttr = bLegend ? "" : " data-tank-id=\"" + String(sUniqueId || "").replace(/"/g, "") + "\"";
            var sClickAttr = "";

            if (!bLegend) {
                var sTankId = String(sUniqueId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                sClickAttr = [
                    " onclick=\"sap.ui.getCore().getEventBus().publish('",
                    TANK_MAP_EVENT_CHANNEL,
                    "','",
                    TANK_MAP_EVENT_PRESS,
                    "',{tankId:'",
                    sTankId,
                    "'});return false;\"",
                    " role=\"button\"",
                    " tabindex=\"0\""
                ].join("");
            }

            return [
                "<div class=\"", sWrapClass, "\" data-status=\"", sStatusCode, "\"", sTankIdAttr, sClickAttr, " title=\"", sTitle, " (클릭하여 상세 보기)\">",
                "<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"", sSvgClass, "\" viewBox=\"0 0 48 56\" aria-hidden=\"true\">",
                "<defs>",
                "<linearGradient id=\"", sGradId, "\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"0%\">",
                "<stop offset=\"0%\" stop-color=\"", oColors.bodyDark, "\"/>",
                "<stop offset=\"48%\" stop-color=\"", oColors.body, "\"/>",
                "<stop offset=\"100%\" stop-color=\"", oColors.bodyDark, "\"/>",
                "</linearGradient>",
                "</defs>",
                "<ellipse cx=\"24\" cy=\"20\" rx=\"16\" ry=\"4.8\" fill=\"", oColors.rim, "\" stroke=\"", oColors.stroke, "\" stroke-width=\"1.1\"/>",
                "<path d=\"M8 20 L8 44 C8 48.8 24 51.5 24 51.5 C24 51.5 40 48.8 40 44 L40 20 Z\" fill=\"url(#", sGradId, ")\" stroke=\"", oColors.stroke, "\" stroke-width=\"1.1\" stroke-linejoin=\"round\"/>",
                "<path d=\"M12 24 C12 33 12 41 12 44\" fill=\"none\" stroke=\"rgba(255,255,255,0.42)\" stroke-width=\"2\" stroke-linecap=\"round\"/>",
                "<ellipse cx=\"24\" cy=\"15.2\" rx=\"14\" ry=\"3.1\" fill=\"none\" stroke=\"", oColors.stroke, "\" stroke-width=\"1\"/>",
                "<line x1=\"12\" y1=\"15.2\" x2=\"12\" y2=\"18.8\" stroke=\"", oColors.stroke, "\" stroke-width=\"1\" stroke-linecap=\"round\"/>",
                "<line x1=\"36\" y1=\"15.2\" x2=\"36\" y2=\"18.8\" stroke=\"", oColors.stroke, "\" stroke-width=\"1\" stroke-linecap=\"round\"/>",
                "<line x1=\"20.5\" y1=\"22\" x2=\"20.5\" y2=\"48.5\" stroke=\"", oColors.stroke, "\" stroke-width=\"1\" stroke-linecap=\"round\"/>",
                "<line x1=\"27.5\" y1=\"22\" x2=\"27.5\" y2=\"48.5\" stroke=\"", oColors.stroke, "\" stroke-width=\"1\" stroke-linecap=\"round\"/>",
                "<line x1=\"20.5\" y1=\"27\" x2=\"27.5\" y2=\"27\" stroke=\"", oColors.stroke, "\" stroke-width=\"0.95\"/>",
                "<line x1=\"20.5\" y1=\"33\" x2=\"27.5\" y2=\"33\" stroke=\"", oColors.stroke, "\" stroke-width=\"0.95\"/>",
                "<line x1=\"20.5\" y1=\"39\" x2=\"27.5\" y2=\"39\" stroke=\"", oColors.stroke, "\" stroke-width=\"0.95\"/>",
                "<line x1=\"20.5\" y1=\"45\" x2=\"27.5\" y2=\"45\" stroke=\"", oColors.stroke, "\" stroke-width=\"0.95\"/>",
                "<path d=\"M34 20 H44 V33\" fill=\"none\" stroke=\"#3D7EC8\" stroke-width=\"1.35\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
                "</svg>",
                "</div>"
            ].join("");
        },

        _chunkTanksIntoRows: function (aTanks, iColumns) {
            var aRows = [];

            for (var i = 0; i < aTanks.length; i += iColumns) {
                var aRowTanks = aTanks.slice(i, i + iColumns);

                while (aRowTanks.length < iColumns) {
                    aRowTanks.push({ isEmpty: true });
                }

                aRows.push({ tanks: aRowTanks });
            }

            return aRows;
        },

        _getZoneLabel: function (sAreaKey, iZoneInGroup) {
            if (sAreaKey === "1000") {
                return "원유 저장 " + (iZoneInGroup + 1) + " 구역";
            }

            if (sAreaKey === "2000") {
                return "생산 공정 " + this._getZoneLetter(iZoneInGroup) + " 구역";
            }

            if (sAreaKey === "3000") {
                return "제품 출하 " + (iZoneInGroup + 1) + " 구역";
            }

            return "기타 " + this._getZoneLetter(iZoneInGroup) + " 구역";
        },

        _getZoneLetter: function (iIndex) {
            var sLetter = "";
            var nIndex = iIndex;

            do {
                sLetter = String.fromCharCode(65 + (nIndex % 26)) + sLetter;
                nIndex = Math.floor(nIndex / 26) - 1;
            } while (nIndex >= 0);

            return sLetter;
        },

        _saveTankListState: function () {
            var oTankModel = this.getView().getModel("tank");

            mTankListStateByWerks[this._sWerks] = {
                werks: this._sWerks,
                scrollTop: this._getTankListScrollTop(),
                search: oTankModel.getProperty("/search") || "",
                areaFilter: oTankModel.getProperty("/areaFilter") || "ALL",
                selectedTab: oTankModel.getProperty("/selectedTab") || "tankStatus",
                viewMode: oTankModel.getProperty("/viewMode") || "map",
                currentPage: oTankModel.getProperty("/pagination/currentPage") || 1
            };
        },

        _restoreTankListModelState: function (oSavedState) {
            var oTankModel = this.getView().getModel("tank");

            oTankModel.setProperty("/search", oSavedState.search || "");
            oTankModel.setProperty("/areaFilter", oSavedState.areaFilter || "ALL");
            oTankModel.setProperty("/selectedTab", oSavedState.selectedTab || "tankStatus");
            oTankModel.setProperty("/viewMode", oSavedState.viewMode || "map");
            oTankModel.setProperty("/pagination/currentPage", oSavedState.currentPage || 1);
        },

        _finishTankListRestore: function () {
            if (!this._oPendingListRestore) {
                return;
            }

            var oSavedState = this._oPendingListRestore;

            this._goToTablePage(oSavedState.currentPage || 1);
            this._restoreScroll(oSavedState.scrollTop);
            delete mTankListStateByWerks[this._sWerks];
            this._bRestoreListState = false;
            this._oPendingListRestore = null;

            setTimeout(function () {
                this._renderZoneDonutCharts();
            }.bind(this), 200);
        },

        _getTankListScrollElement: function () {
            var oPage = this.byId("tankPage");

            if (oPage && oPage.getDomRef()) {
                var oSection = oPage.getDomRef().querySelector("section");

                if (oSection && oSection.scrollHeight > oSection.clientHeight) {
                    return oSection;
                }
            }

            return document.scrollingElement || document.documentElement;
        },

        _getTankListScrollTop: function () {
            var oScrollElement = this._getTankListScrollElement();

            return oScrollElement ? oScrollElement.scrollTop : (window.pageYOffset || 0);
        },

        _restoreScroll: function (iScrollTop) {
            if (!iScrollTop) {
                return;
            }

            var fnRestore = function () {
                var oScrollElement = this._getTankListScrollElement();

                if (oScrollElement) {
                    oScrollElement.scrollTop = iScrollTop;
                }

                window.scrollTo(0, iScrollTop);
            }.bind(this);

            setTimeout(fnRestore, 0);
            setTimeout(fnRestore, 200);
        },

        _applyFilters: function (bResetPage) {
            var oTankModel = this.getView().getModel("tank");
            var sSearch = (oTankModel.getProperty("/search") || "").toLowerCase();
            var sAreaFilter = oTankModel.getProperty("/areaFilter") || "ALL";

            this._aFilteredTanks = this._aAllTanks.filter(function (oTank) {
                var bAreaMatch = sAreaFilter === "ALL" || oTank.areaKey === sAreaFilter;
                var bSearchMatch = !sSearch
                    || oTank.tankId.toLowerCase().indexOf(sSearch) >= 0
                    || oTank.tankName.toLowerCase().indexOf(sSearch) >= 0;

                return bAreaMatch && bSearchMatch;
            });

            this._updateTankAreaMap(this._aFilteredTanks);

            if (bResetPage !== false) {
                this._goToTablePage(1);
            } else {
                this._updateDisplayTanks();
            }
        },

        _updateDisplayTanks: function () {
            var oTankModel = this.getView().getModel("tank");
            var iTotalItems = this._aFilteredTanks.length;
            var iPageSize = oTankModel.getProperty("/pagination/pageSize") || PAGE_SIZE;
            var iTotalPages = Math.max(Math.ceil(iTotalItems / iPageSize), 1);
            var iCurrentPage = oTankModel.getProperty("/pagination/currentPage") || 1;

            if (iCurrentPage > iTotalPages) {
                iCurrentPage = iTotalPages;
            }

            var iStartIndex = (iCurrentPage - 1) * iPageSize;
            var iEndIndex = iStartIndex + iPageSize;
            var aVisibleTanks = this._aFilteredTanks.slice(iStartIndex, iEndIndex);
            var iRangeStart = iTotalItems === 0 ? 0 : iStartIndex + 1;
            var iRangeEnd = Math.min(iEndIndex, iTotalItems);

            oTankModel.setProperty("/displayTanks", aVisibleTanks);
            oTankModel.setProperty("/pagination", {
                currentPage: iCurrentPage,
                pageSize: iPageSize,
                totalItems: iTotalItems,
                totalPages: iTotalPages,
                rangeText: iTotalItems === 0 ? "0 / 0" : iRangeStart + " - " + iRangeEnd + " / " + iTotalItems,
                hasPrev: iCurrentPage > 1,
                hasNext: iCurrentPage < iTotalPages
            });
        },

        _formatODataDate: function (vDate) {
            if (!vDate) {
                return "-";
            }

            var oDate = vDate instanceof Date ? vDate : new Date(vDate);

            if (isNaN(oDate.getTime())) {
                return "-";
            }

            var sYear = oDate.getFullYear();
            var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            var sDay = String(oDate.getDate()).padStart(2, "0");

            return sYear + "." + sMonth + "." + sDay;
        }
    });
});
