sap.ui.define([
	'medunited/base/controller/AbstractMasterController',
	'sap/ui/model/Filter',
	'sap/ui/model/FilterOperator',
	'medunited/care/utils/ProcessUpload',
	'sap/m/MessageBox',
	'sap/m/MessageToast',
	"sap/ui/core/Fragment",
	"medunited/care/utils/DemoAccount"
], function (AbstractMasterController, Filter, FilterOperator, ProcessUpload, MessageBox, MessageToast, Fragment, DemoAccount) {
	"use strict";

	return AbstractMasterController.extend("medunited.care.controller.patient.Master", {

		getEntityName: function () {
			return "Patient";
		},
		getFilter: function (sQuery) {
			return [new Filter({
				filters: [
					new Filter("given", FilterOperator.Contains, sQuery),
					new Filter("family", FilterOperator.Contains, sQuery)
				],
				and: false
			}
			)];
		},
		getSortField: function () {
			return "family";
		},
		onImportPatientFromCSV: function () {
			var oView = this.getView();
			// create dialog lazily
			if (!this.byId("importCSVDialog")) {
				// load asynchronous XML fragment
				Fragment.load({
					id: oView.getId(),
					name: "medunited.care.view.patient.ImportCSVDialog",
					controller: this
				}).then(function (oDialog) {
					// connect dialog to the root view of this component (models, lifecycle)
					oView.addDependent(oDialog);
					oDialog.open();
				}.bind(this));
			} else {
				this.byId("importCSVDialog").open();
			}
		},
		onUploadCSVCancel: function () {
			this.byId("importCSVDialog").close();
		},
		onUploadCSVFile: function () {
			if(DemoAccount._isDemoAccount(this.getView())){
				return
			}
			let fileUploader = this.getView().byId("idfileUploader");
			let domRef = fileUploader.getFocusDomRef();
			let file = domRef.files[0];
			const me = this;
			ProcessUpload.processUploadedFile(file, this.getView())
				.then((aResources) => {
					MessageToast.show(me.translate("msgCountCreated", aResources.length));
					me.byId("importCSVDialog").close();
				}, (oError) => {
					MessageBox.show(me.translate("msgPatientSavedFailed", [oError.statusCode, oError.statusText]));
				})
		},

		onPressCreatePatientFromBMP: function () {
			if(DemoAccount._isDemoAccount(this.getView())){
				return
			}
			this.byId("extScanner").open();
		},
		referencePractitioner: function (sPractitionerPath) {
			try {
				if (sPractitionerPath) {
					return this.getNameForPath("/" + sPractitionerPath);
				}
			} catch (e) {
				console.log(e);
				return "Arzt unbekannt";
			}
		},
		getNameForPath: function (sObjectPath) {
			const oFhirModel = this.getView().getModel();
			const oObject = oFhirModel.getProperty(sObjectPath);
			return oObject.name[0]?.given[0] + " " + oObject.name[0]?.family;
		},
		referenceOrganization: function (sOrganizationPath) {
			try {
				if (sOrganizationPath) {
					return this.getPharmacyNameForPath("/" + sOrganizationPath);
				}
			} catch (e) {
				console.log(e);
				return "Apotheke unbekannt";
			}
		},
		getPharmacyNameForPath: function (sObjectPath) {
			const oFhirModel = this.getView().getModel();
			const oObject = oFhirModel.getProperty(sObjectPath);
			return oObject.name;
		},

		onValueScanned: function (oEvent) {

			const mPZN2Name = {};
			const sEMP = oEvent.getParameter("value")
			const parser = new DOMParser();
			const oEMP = parser.parseFromString(sEMP, "application/xml");

			Promise.all(
				Array.from(oEMP.querySelectorAll("M"))
					.map(m => m.getAttribute("p"))
					.map(sPZN => fetch("https://medication.med-united.health/ajax/search/drugs/auto/?query=" + sPZN)
						.then(r => r.json())
						.then(oMedication => {
							if (oMedication.results.length > 0) {
								mPZN2Name[sPZN] = oMedication.results[0].name;
							}
							return true;
						})
					)).then(() => {
						this.createMedicationStatementWithNames(oEMP, mPZN2Name);
					});


		},
		createMedicationStatementWithNames: function (oEMP, mPZN2Name) {
			try {
				// <MP v="025" U="02BD2867FB024401A590D59D94E1FFAE" l="de-DE"><P g="J??rgen" f="Wernersen" b="19400324"/><A n="Praxis Dr. Michael M??ller" s="Schlo??str. 22" z="10555" c="Berlin" p="030-1234567" e="dr.mueller@kbv-net.de" t="2018-07-01T12:00:00"/><S><M p="230272" m="1" du="1" r="Herz/Blutdruck"/><M p="2223945" m="1" du="1" r="Blutdruck"/><M p="558736" m="20" v="20" du="p" i="Wechseln der Injektionsstellen, unmittelbar vor einer Mahlzeit spritzen" r="Diabetes"/><M p="9900751" v="1" du="1" r="Blutfette"/></S><S t="zu besonderen Zeiten anzuwendende Medikamente"><M p="2239828" t="alle drei Tage 1" du="1" i="auf wechselnde Stellen aufkleben" r="Schmerzen"/></S><S c="418"><M p="2455874" m="1" du="1" r="Stimmung"/></S></MP>
				const oModel = this.getView().getModel();
				const sBirthdate = oEMP.querySelector("P").getAttribute("b");
				// TODO: prevent duplicates
				const oPatient = {
					"name": [
						{
							"given": [oEMP.querySelector("P").getAttribute("g")],
							"family": oEMP.querySelector("P").getAttribute("f"),
							"use": "official"
						}
					],
					"birthDate": sBirthdate.substring(0, 4) + "-" + sBirthdate.substring(4, 6) + "-" + sBirthdate.substring(6, 8)
				};

				// <A n="Praxis Dr. Michael M??ller" s="Schlo??str. 22" z="10555" c="Berlin" p="030-1234567" e="dr.mueller@kbv-net.de" t="2018-07-01T12:00:00"/>
				const oPractitionerNode = oEMP.querySelector("A");
				let sPractitionerId = undefined;
				if (oPractitionerNode) {
					const sName = oPractitionerNode.getAttribute("n");
					const oPractitioner = {};
					if (sName && sName.split(/ /).length > 1) {
						const aNameParts = sName.split(/ /);
						oPractitioner.name = [
							{
								"given": [aNameParts[aNameParts.length - 2]],
								"family": aNameParts[aNameParts.length - 1],
								"use": "official"
							}
						];
						oPractitioner.address = [
							{
								"line": [oPractitionerNode.getAttribute("s")],
								"postalCode": oPractitionerNode.getAttribute("z"),
								"city": oPractitionerNode.getAttribute("c")
							}
						];
						oPractitioner.telecom = [];
						const sPhone = oPractitionerNode.getAttribute("p");
						if (sPhone) {
							oPractitioner.telecom.push({
								"system": "phone",
								"value": sPhone
							});
						}
						const sEmail = oPractitionerNode.getAttribute("e");
						if (sEmail) {
							oPractitioner.telecom.push({
								"system": "email",
								"value": sEmail
							});
						}
					}
					sPractitionerId = oModel.create("Practitioner", oPractitioner, "patientDetails");
				}

				if (sPractitionerId) {
					oPatient.generalPractitioner = {
						"reference": "urn:uuid:" + sPractitionerId
					}
				}

				const sPatientId = oModel.create(this.getEntityName(), oPatient, "patientDetails");

				const aMedication = Array.from(oEMP.querySelectorAll("M"));
				// https://www.vesta-gematik.de/standard/formhandler/324/gemSpec_Info_AMTS_V1_5_0.pdf
				for (let oMedication of aMedication) {
					let sPZN = oMedication.getAttribute("p");
					let sDosierschemaMorgens = oMedication.getAttribute("m");
					if (!sDosierschemaMorgens) {
						sDosierschemaMorgens = "0";
					}
					let sDosierschemaMittags = oMedication.getAttribute("d");
					if (!sDosierschemaMittags) {
						sDosierschemaMittags = "0";
					}
					let sDosierschemaAbends = oMedication.getAttribute("v");
					if (!sDosierschemaAbends) {
						sDosierschemaAbends = "0";
					}
					let sDosierschemaNachts = oMedication.getAttribute("h");
					if (!sDosierschemaNachts) {
						sDosierschemaNachts = "0";
					}
					// Dosiereinheit strukturiert
					let sDosage = oMedication.getAttribute("du");
					// reason
					let sReason = oMedication.getAttribute("r");
					let sAdditionalInformation = oMedication.getAttribute("i");

					const medicationName = mPZN2Name[sPZN];

					const oMedicationStatement = {
						identifier: [{ "value": sPZN }],
						medicationCodeableConcept: { "text": medicationName },
						dosage: [
							{ text: sDosierschemaMorgens + "-" + sDosierschemaMittags + "-" + sDosierschemaAbends + "-" + sDosierschemaNachts }
						],
						subject: { reference: "urn:uuid:" + sPatientId },
						note: "Grund: " + sReason + " Hinweis: " + sAdditionalInformation
					};
					if (sPractitionerId) {
						oMedicationStatement.informationSource = {
							reference: "urn:uuid:" + sPractitionerId
						};
					}
					oModel.create("MedicationStatement", oMedicationStatement, "patientDetails");
				}
				this.save();
			} catch (e) {
				console.log(e);
			}
		}
	});
}, true);
