sap.ui.define([
	"medunited/base/controller/AbstractDetailController",
	"../../utils/Formatter",
	"sap/m/MessageBox",
	"sap/ui/core/Fragment",
	"sap/base/security/URLListValidator"
], function (AbstractDetailController, Formatter, MessageBox, Fragment, URLListValidator, MedicationSearchProvider) {
	"use strict";

	return AbstractDetailController.extend("medunited.care.controller.patient.Detail", {
		formatter: Formatter,
		getEntityName: function () {
			return "Patient";
		},
		getBindElementParams: function () {
			return {
				groupId: "patientDetails"
			};
		},
		formatPatientDataMatrix: function (sId) {
			const oPatient = this.getView().getModel().getProperty("/Patient/" + sId);
			const oMedicationStatement = this.getView().getModel().getProperty("/MedicationStatement");
			if (!oMedicationStatement) {
				return "";
			}
			const aMedicationStatementForPatient = Object.values(oMedicationStatement)
				.filter(aMS => aMS.subject && aMS.subject.reference === "Patient/" + sId)
				.sort(function compareFn(a, b) {
					let aValueDecimal = 0;
					if(a && a.extension && a.extension[2]) {
						aValueDecimal = a.extension[2].valueDecimal
					}
					let bValueDecimal = 0;
					if(b && b.extension && b.extension[2]) {
						bValueDecimal = b.extension[2].valueDecimal
					}
					return bValueDecimal - aValueDecimal;
				});
			return this.getMedicationPlanXml(oPatient, aMedicationStatementForPatient);
		},
		getMedicationPlanXml: function (oPatient, aMedicationStatementForPatient) {
			//https://update.kbv.de/ita-update/Verordnungen/Arzneimittel/BMP/EXT_ITA_VGEX_BMP_Anlage3_mitAend.pdf
			let sXML = "<MP xmlns=\"http://ws.gematik.de/fa/amtss/AMTS_Document/v1.6\" v=\"025\" U=\"" + [...Array(32)].map(() => 'ABCDEF0123456789'.charAt(Math.floor(Math.random() * 16))).join('') + "\" l=\"de-DE\">\n";
			if (oPatient && oPatient.name && oPatient.name.length > 0 && oPatient.name[0].given) {
				sXML += "  <P g=\"" + oPatient.name[0].given[0] + "\" f=\"" + oPatient.name[0].family + "\" b=\"" + (oPatient.birthDate ? oPatient.birthDate.replaceAll("-", "") : "") + "\" />\n";
			}
			sXML += "  <A n=\"med.united " + this.getNameFromLoggedPerson() + "\" s=\"" + this.getStreetFromLoggedPerson() + "\" z=\"" + this.getPostalCodeFromLoggedPerson() + "\" c=\"" + this.getCityFromLoggedPerson() + "\" p=\"" + this.getPhoneNumberFromLoggedPerson() + "\" e=\"" + this.getEmailFromLoggedPerson() + "\" t=\"" + new Date().toISOString().substring(0, 19) + "\" />\n";
			sXML += "  <S>\n";
			for (let oMedicationStatement of aMedicationStatementForPatient) {
				try {
					if(!oMedicationStatement) {
						continue;
					}
					const pzn = (oMedicationStatement.identifier && oMedicationStatement.identifier.length > 0) ? oMedicationStatement.identifier[0].value : "";
					sXML += "    <M"+ (pzn ? " p=\""+pzn+"\"" : "") + " ";
					if(oMedicationStatement && oMedicationStatement.medicationCodeableConcept) {
						const medicationName = oMedicationStatement.medicationCodeableConcept.text;
						if (medicationName) {
							sXML += "a=\"" + this.escapeXml(medicationName) + "\" ";
						} else {
							sXML += "a=\"\" ";
						}
					} else {
						sXML += "a=\"\" ";
					}
					const oDosage = oMedicationStatement.dosage;
					if (oDosage && oDosage.length > 0 && oDosage[0].text) {
						const aDosage = oDosage[0].text.split(/-/);
						const mDosage = {
							0: "m",
							1: "d",
							2: "v",
							3: "h"
						};
						for (let i = 0; i < aDosage.length; i++) {
							if(parseFloat(aDosage[i].replaceAll(/,/g, ".")) > 0) {
								sXML += mDosage[i] + "=\"" + aDosage[i] + "\" ";
							}
						}
					}
					const vNote = oMedicationStatement.note;
					if (typeof vNote === "string") {
						sXML = this.extractReasonInfo(vNote, sXML);
					} else if(typeof vNote === "object") {
						for(let oItem in vNote) {
							if("text" in vNote[oItem]) {
								sXML = this.extractReasonInfo(vNote[oItem].text, sXML);
								break;
							}
						}
					}
					sXML += "/>\n";
				} catch (e) {
					console.error(e);
				}
			}
			sXML += "   </S>\n";
			sXML += "</MP>";
			return sXML;
		},

		extractReasonInfo: function(sNote, sXML) {
			if(!sNote) {
				return sXML;
			}
			const m = sNote.match("Grund: (.*) Hinweis: (.*)");
			if (m) {
				sXML += "r=\"" + this.escapeXml(m.group(1)) + "\" i=\"" + this.escapeXml(m.group(2)) + "\" ";
			} else {
				sXML += "i=\"" + this.escapeXml(sNote) + "\" ";
			}
			return sXML;
		},

		escapeXml: function(unsafe) {
			if(!unsafe) {
				return unsafe;
			}
			return unsafe.replace(/[<>&'"]/g, function (c) {
				switch (c) {
					case '<': return '&lt;';
					case '>': return '&gt;';
					case '&': return '&amp;';
					case '\'': return '&apos;';
					case '"': return '&quot;';
				}
			});
		},

		validateUserCustomAttributes() {
			const phone = this.getPhoneNumberFromLoggedPerson()
			const city = this.getCityFromLoggedPerson()
			const street = this.getStreetFromLoggedPerson()
			const postalCode = this.getPostalCodeFromLoggedPerson()
			if (!phone || !city || !street || !postalCode) {
				location.href = 'https://id.med-united.health/realms/med-united/account/';
			}
		},

		getPhoneNumberFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/phone")
		},

		getNameFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/name")
		},

		getEmailFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/email")
		},

		getStreetFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/street")
		},

		getPostalCodeFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/postalCode")
		},

		getCityFromLoggedPerson() {
			return this.getView().getModel("JWT").getProperty("/city")
		},

		onCreateMedicationPlan: function () {
			this.validateUserCustomAttributes()
			const sPatientId = this._entity
			fetch("https://medicationplan.med-united.health/medicationPlanPdf", {
				method: "POST",
				mode: "cors",
				body: this.formatPatientDataMatrix(sPatientId),
				headers: {
					"Accept": "application/pdf",
					"Content-Type": "application/xml"
				}
			})
				.then((oResponse) => {
					if (!oResponse.ok) {
						throw Error(oResponse.statusText);
					}
					return oResponse;
				})
				.then(oResponse => oResponse.blob())
				.then((oBlob) => {
					const sObjectURL = URL.createObjectURL(oBlob);
					if (!this.byId("medicationPlanDialog")) {
						URLListValidator.add("blob");
						// load asynchronous XML fragment
						Fragment.load({
							id: this.getView().getId(),
							name: "medunited.care.view." + this.getEntityName().toLowerCase() + ".MedicationPlanDialog",
							controller: this
						}).then((oDialog) => {
							// connect dialog to the root view of this component (models, lifecycle)
							this.getView().addDependent(oDialog);
							this._openMedicationPlanDialog(oDialog, sObjectURL);
						});
					} else {
						this._openMedicationPlanDialog(this.byId("medicationPlanDialog"), sObjectURL);
					}
				}).catch((oError) => MessageBox.show(this.translate("msgError", [oError])));
		},
		_openMedicationPlanDialog: function (oDialog, sObjectURL) {
			oDialog.open();
			this.byId("medicationPlanPdfViewer").setSource(sObjectURL);
		},
		onCloseMedicationPlan: function () {
			this.byId("medicationPlanDialog").close();
		},
		copyXMLOfDataMatrixCodeToClipboard: async function (oEvent) {
			let XMLOfDataMatrixCode = this.byId("medicationPlanDataMatrixCode").getMsg();
			let text;
			while(text != XMLOfDataMatrixCode) {
				navigator.clipboard.writeText(XMLOfDataMatrixCode);
				text = await navigator.clipboard.readText();
			}
			alert("Das folgende XML wurde in die Zwischenablage kopiert:\n\n" + XMLOfDataMatrixCode)
		},
		validateResource: function () {
			const oModel = this.getView().getModel();
			let medicationStatementsOfPatient = this.getMedicationStatementsOfPatient(this._entity);
            for (let i of medicationStatementsOfPatient) {
				// Validate PZNs
				let pznValue = oModel.getProperty("/MedicationStatement/" + i + "/identifier/0/value");
				oModel.setProperty("/MedicationStatement/" + i + "/identifier/0/value", parseInt(pznValue, 10));
				// Validate Dosages
				let dosageValue = oModel.getProperty("/MedicationStatement/" + i + "/dosage/0/text");
				if (dosageValue === "" || dosageValue == null || dosageValue.trim().length === 0) {
					MessageBox.error(this.translate("msgAtLeastOneOfTheDosagesWasNotSpecified"), {
						title: this.translate("msgErrorTitle"),
						onClose: null,
						styleClass: "",
						actions: sap.m.MessageBox.Action.CLOSE,
						emphasizedAction: null,
						initialFocus: null,
						textDirection: sap.ui.core.TextDirection.Inherit
					});
					return false;
				}
				else if (dosageValue !== "" && dosageValue.trim().length > 0 && dosageValue.includes("-") && dosageValue.match(/-/g).length == 3) {
					let morgensDosage = dosageValue.split("-")[0].replace(/\s/g, "");
					let mittagsDosage = dosageValue.split("-")[1].replace(/\s/g, "");
					let abendsDosage = dosageValue.split("-")[2].replace(/\s/g, "");
					let nachtsDosage = dosageValue.split("-")[3].replace(/\s/g, "");
					if (morgensDosage == "") {
						morgensDosage = "0";
					}
					if (mittagsDosage == "") {
						mittagsDosage = "0";
					}
					if (abendsDosage == "") {
						abendsDosage = "0";
					}
					if (nachtsDosage == "") {
						nachtsDosage = "0";
					}
					if (/^\d+(,\d+)?$/.test(morgensDosage.trim()) && /^\d+(,\d+)?$/.test(mittagsDosage.trim()) && /^\d+(,\d+)?$/.test(abendsDosage.trim()) && /^\d+(,\d+)?$/.test(nachtsDosage.trim())) {
						let newDosageValue = morgensDosage.trim() + "-" + mittagsDosage.trim() + "-" + abendsDosage.trim() + "-" + nachtsDosage.trim();
						oModel.setProperty("/MedicationStatement/" + i + "/dosage/0/text", newDosageValue);
					}
					else {
						MessageBox.error(this.translate("msgAtLeastOneOfTheDosagesContainsCharactersThatAreNotDigits"), {
							title: this.translate("msgErrorTitle"),
							onClose: null,
							styleClass: "",
							actions: sap.m.MessageBox.Action.CLOSE,
							emphasizedAction: null,
							initialFocus: null,
							textDirection: sap.ui.core.TextDirection.Inherit
						});
						return false;
					}
				}
				else {
					MessageBox.error(this.translate("msgAtLeastOneOfTheDosagesDoesNotHaveTheRightFormat"), {
						title: this.translate("msgErrorTitle"),
						onClose: null,
						styleClass: "",
						actions: sap.m.MessageBox.Action.CLOSE,
						emphasizedAction: null,
						initialFocus: null,
						textDirection: sap.ui.core.TextDirection.Inherit
					});
					return false;
				}
			}
			return true;
		},
		getMedicationStatementsOfPatient: function (patientId) {
			let oModel = this.getView().getModel();
			let medicationStatements = oModel.getProperty("/MedicationStatement");
			let medicationStatementsOfPatient = [];
			for (let medStat in medicationStatements) {
				if (oModel.getProperty("/MedicationStatement/" + medStat + "/subject/reference") == "Patient/" + patientId) {
					medicationStatementsOfPatient.push(medStat);
				}
			}
			return medicationStatementsOfPatient;
		}
	});
}, true);