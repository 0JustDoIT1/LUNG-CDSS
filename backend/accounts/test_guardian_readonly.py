import datetime

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment
from cases.models import AIAnalysisResult, Case, ConfirmedFinding, GenePrediction
from medications.models import MedicationLog, MedicationSchedule

from .models import GuardianLink, User


class GuardianReadOnlyApiTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Connected Patient")
        self.other_patient = User.objects.create_patient(name="Other Patient")
        self.guardian = User.objects.create(role=User.Role.GUARDIAN, name="Guardian")
        self.other_guardian = User.objects.create(role=User.Role.GUARDIAN, name="Other Guardian")
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor")
        self.nurse = User.objects.create_staff(User.Role.NURSE, "Nurse")
        self.link = GuardianLink.objects.create(
            patient=self.patient,
            guardian=self.guardian,
            invite_code="LINK01",
            accepted_at=timezone.now(),
        )
        GuardianLink.objects.create(
            patient=self.other_patient,
            guardian=self.other_guardian,
            invite_code="LINK02",
            accepted_at=timezone.now(),
        )
        self.client.force_authenticate(self.guardian)

    def url(self, name, patient=None):
        return reverse(name, args=[(patient or self.patient).id])

    def test_approved_guardian_can_read_only_connected_patient_appointments(self):
        latest = Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            department="호흡기내과",
            requested_at_slot=timezone.now() + datetime.timedelta(days=2),
            confirmed_slot=timezone.now() + datetime.timedelta(days=2),
            status=Appointment.Status.CONFIRMED,
        )
        Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            department="종양내과",
            requested_at_slot=timezone.now() + datetime.timedelta(days=1),
            status=Appointment.Status.REQUESTED,
        )
        Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            department="취소과",
            requested_at_slot=timezone.now() + datetime.timedelta(days=3),
            status=Appointment.Status.CANCELLED,
        )
        Appointment.objects.create(
            patient=self.other_patient,
            doctor=self.doctor,
            department="다른환자과",
            requested_at_slot=timezone.now() + datetime.timedelta(days=4),
        )

        response = self.client.get(self.url("guardian-patient-appointments"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["id"], str(latest.id))
        self.assertEqual(
            set(response.data[0]),
            {"id", "requested_at_slot", "confirmed_slot", "department", "doctor_name", "status"},
        )

    def test_other_patient_appointments_are_forbidden(self):
        response = self.client.get(self.url("guardian-patient-appointments", self.other_patient))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unapproved_link_is_forbidden(self):
        self.link.accepted_at = None
        self.link.save(update_fields=["accepted_at"])
        response = self.client.get(self.url("guardian-patient-appointments"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_deleted_link_is_forbidden(self):
        self.link.delete()
        response = self.client.get(self.url("guardian-patient-appointments"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_connected_patient_is_forbidden(self):
        self.patient.is_active = False
        self.patient.save(update_fields=["is_active"])
        response = self.client.get(self.url("guardian-patient-appointments"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_appointment_endpoint_rejects_mutation(self):
        response = self.client.post(self.url("guardian-patient-appointments"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_approved_guardian_can_read_today_medications(self):
        schedule = MedicationSchedule.objects.create(
            patient=self.patient,
            drug_name="테스트약",
            dosage="1정",
            times_per_day=["09:00"],
            start_date=timezone.localdate(),
            set_by=self.nurse,
        )
        log = MedicationLog.objects.create(
            schedule=schedule,
            scheduled_time=timezone.now(),
            taken=True,
            taken_at=timezone.now(),
        )
        other_schedule = MedicationSchedule.objects.create(
            patient=self.other_patient,
            drug_name="다른환자약",
            dosage="2정",
            times_per_day=["10:00"],
            start_date=timezone.localdate(),
            set_by=self.nurse,
        )
        MedicationLog.objects.create(schedule=other_schedule, scheduled_time=timezone.now())

        response = self.client.get(self.url("guardian-patient-medications"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], str(log.id))
        self.assertTrue(response.data[0]["taken"])
        self.assertEqual(
            set(response.data[0]),
            {"id", "drug_name", "dosage", "scheduled_time", "taken", "taken_at"},
        )

    def test_other_patient_medications_are_forbidden(self):
        response = self.client.get(self.url("guardian-patient-medications", self.other_patient))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_medication_endpoint_rejects_mutation(self):
        response = self.client.patch(self.url("guardian-patient-medications"), {"taken": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def _create_result(self, patient, specimen_id, case_status, with_finding):
        case = Case.objects.create(patient=patient, specimen_id=specimen_id, status=case_status)
        ai_result = AIAnalysisResult.objects.create(
            case=case,
            model_version="private-model",
            prediction_label="LUAD",
            luad_probability=0.9,
            lusc_probability=0.1,
            treatment_note="private",
        )
        GenePrediction.objects.create(ai_result=ai_result, gene_name="EGFR", likelihood=0.64)
        GenePrediction.objects.create(ai_result=ai_result, gene_name="TP53", likelihood=0.31)
        if with_finding:
            ConfirmedFinding.objects.create(
                case=case,
                based_on_result=ai_result,
                final_subtype="LUAD",
                final_note="공개 안내",
                confirmed_by=self.doctor,
            )
        return case

    def test_guardian_receives_only_released_confirmed_results(self):
        self._create_result(self.patient, "RELEASED", Case.Status.CONFIRMED, True)
        self._create_result(self.patient, "NO-FINDING", Case.Status.CONFIRMED, False)
        self._create_result(self.patient, "PENDING", Case.Status.PENDING_REVIEW, True)
        self._create_result(self.other_patient, "OTHER", Case.Status.CONFIRMED, True)

        response = self.client.get(self.url("guardian-patient-results"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["final_subtype"], "LUAD")
        self.assertEqual(
            response.data[0]["gene_predictions"],
            [
                {"gene_name": "EGFR", "likelihood": 0.64},
                {"gene_name": "TP53", "likelihood": 0.31},
            ],
        )
        self.assertEqual(
            set(response.data[0]),
            {"final_subtype", "gene_predictions", "confirmed_at", "released_at"},
        )
        forbidden = {
            "prediction_label", "luad_probability", "lusc_probability", "final_note",
            "heatmap_url", "nuclei_patches", "nuclei_density_score", "treatment_note",
        }
        self.assertTrue(forbidden.isdisjoint(response.data[0]))

    def test_patient_result_api_contract_is_unchanged(self):
        self._create_result(self.patient, "PATIENT-CONTRACT", Case.Status.CONFIRMED, True)
        self.client.force_authenticate(self.patient)

        response = self.client.get(reverse("my-results"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["final_note"], "공개 안내")
        self.assertEqual(response.data[0]["luad_probability"], 0.9)
        self.assertEqual(response.data[0]["lusc_probability"], 0.1)
        self.assertEqual(
            response.data[0]["gene_predictions"],
            [
                {"gene_name": "EGFR", "likelihood": 0.64},
                {"gene_name": "TP53", "likelihood": 0.31},
            ],
        )

    def test_other_patient_results_are_forbidden(self):
        response = self.client.get(self.url("guardian-patient-results", self.other_patient))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_results_endpoint_rejects_mutation(self):
        response = self.client.delete(self.url("guardian-patient-results"))
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_empty_connected_patient_data_returns_empty_lists(self):
        for name in (
            "guardian-patient-appointments",
            "guardian-patient-medications",
            "guardian-patient-results",
        ):
            response = self.client.get(self.url(name))
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data, [])

    def test_guardian_cannot_access_general_case_apis(self):
        case = self._create_result(self.patient, "BLOCKED", Case.Status.CONFIRMED, True)

        list_response = self.client.get(reverse("case-list-create"))
        detail_response = self.client.get(reverse("case-detail", args=[case.id]))

        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(detail_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_guardian_summary_does_not_expose_case_status(self):
        self._create_result(self.patient, "SUMMARY-PRIVATE", Case.Status.PENDING_REVIEW, False)

        response = self.client.get(self.url("guardian-patient-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("case_status", response.data)


class ExistingCaseRolePermissionTests(APITestCase):
    def setUp(self):
        self.patient = User.objects.create_patient(name="Patient")
        self.case = Case.objects.create(
            patient=self.patient,
            specimen_id="EXISTING-ROLE",
            status=Case.Status.CONFIRMED,
        )

    def test_patient_can_still_list_own_cases(self):
        self.client.force_authenticate(self.patient)
        response = self.client.get(reverse("case-list-create"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_medical_staff_can_still_list_cases(self):
        for role in (User.Role.DOCTOR, User.Role.NURSE, User.Role.PATHOLOGIST):
            with self.subTest(role=role):
                self.client.force_authenticate(User.objects.create_staff(role, role))
                response = self.client.get(reverse("case-list-create"))
                self.assertEqual(response.status_code, status.HTTP_200_OK)
