sap.ui.define([
    "medunited/base/controller/AbstractController",
    "../../utils/Formatter",
    "sap/fhir/model/r4/FHIRFilter",
    "sap/fhir/model/r4/FHIRFilterType",
    "sap/fhir/model/r4/FHIRFilterOperator"
], function(AbstractController, Formatter, FHIRFilter, FHIRFilterType, FHIRFilterOperator) {
	"use strict";

	return AbstractController.extend("medunited.care.SharedBlocks.medication.MedicationBlockController", {
   
        formatter: Formatter,

        onInit: function(){
            this.initializeRouter();

            // this is a workaround because the block controller gets initialized after the desired route is matched the first time
            var fnInitialFiltering =  function(oEvent){
                var oMedicationTable = oEvent.getSource();
                var oBindingContext = oMedicationTable.getBindingContext();
                if (oBindingContext) {
                    // here comes eg. '/Patient/123'
                    var sPatientId = oBindingContext.getPath().split("/")[2];
                    this.filterMedicationTableToPatient(sPatientId);
                    oMedicationTable.detachModelContextChange(fnInitialFiltering);
                }
            };
            this.getView().byId("medicationTable").attachModelContextChange(fnInitialFiltering.bind(this));
        },

		initializeRouter: function(){
            this.oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            this.oRouter.getRoute("patient-detail").attachPatternMatched(this.onPatientRouteMatched, this);
        },

        onPatientRouteMatched: function(oEvent){
            var sPatientId = oEvent.getParameter("arguments").patient;
            this.filterMedicationTableToPatient(sPatientId);
        },

        filterMedicationTableToPatient: function(sPatientId){
            var aFilters = [];
            aFilters.push(new FHIRFilter({ path: "subject", operator : FHIRFilterOperator.StartsWith, value1: "Patient/" + sPatientId, valueType: FHIRFilterType.string}));
            this.getView().byId("medicationTable").getBinding("items").filter(aFilters);
        },

        addMedication: function(){
            var sPatientId = this.byId("medicationTable").getBindingContext().getPath().split("/")[2];
            var sMedicationStatementId = this.getView().getModel().create("MedicationStatement", {subject: {reference: "Patient/" + sPatientId}}, "patientDetails");
        },
        deleteMedication: function() {
            const aResources = this.byId("medicationTable").getSelectedItems().map(oItem => oItem.getBindingContext().getPath());
			const iCount = aResources.length;
			const oModel = this.getView().getModel();
			const me = this;
			oModel.remove(aResources);

			oModel.submitChanges(function () {
				MessageToast.show(me.translate("msgCountDeleted", iCount));
			}, function (oError) {
				MessageBox.show(me.translate("msgDeleteFailed", [oError.statusCode, oError.statusText]));
			});
        }

    });
});