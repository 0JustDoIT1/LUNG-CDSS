from datetime import date

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Hospital, NurseProfile, PatientProfile, User
from cases.models import AIAnalysisResult, Case, ConfirmedFinding

from .models import MedicationSchedule


class PendingSetupPatientApiTests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name='Test Hospital')
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, 'Doctor One')
        self.other_doctor = User.objects.create_staff(User.Role.DOCTOR, 'Doctor Two')
        self.nurse = User.objects.create_staff(User.Role.NURSE, 'Nurse One')
        NurseProfile.objects.create(
            user=self.nurse, department='Oncology', hospital=self.hospital,
        )
        self.url = reverse('medication-pending-setup')

    def create_patient(self, name, assigned_doctor, hospital=None):
        patient = User.objects.create_patient(name=name)
        PatientProfile.objects.create(
            user=patient,
            patient_number=f'PAT-{PatientProfile.objects.count() + 1}',
            birth_date=date(1990, 1, 1),
            hospital=hospital or self.hospital,
            assigned_doctor=assigned_doctor,
        )
        return patient

    def confirm_plan(self, patient, specimen_id):
        case = Case.objects.create(
            patient=patient, specimen_id=specimen_id, status=Case.Status.CONFIRMED,
        )
        result = AIAnalysisResult.objects.create(case=case, model_version='test')
        ConfirmedFinding.objects.create(
            case=case, based_on_result=result, final_subtype='LUAD',
            final_note='confirmed plan', confirmed_by=self.doctor,
        )

    def test_returns_only_assigned_confirmed_patients_without_a_schedule(self):
        pending = self.create_patient('Pending Patient', self.doctor)
        self.confirm_plan(pending, 'PENDING')

        scheduled = self.create_patient('Scheduled Patient', self.doctor)
        self.confirm_plan(scheduled, 'SCHEDULED')
        MedicationSchedule.objects.create(
            patient=scheduled, drug_name='Drug', dosage='1 tablet',
            times_per_day=['09:00'], start_date=timezone.localdate(),
        )

        unconfirmed = self.create_patient('Unconfirmed Patient', self.doctor)
        Case.objects.create(
            patient=unconfirmed, specimen_id='UNCONFIRMED',
            status=Case.Status.PENDING_REVIEW,
        )
        other = self.create_patient('Other Patient', self.other_doctor)
        self.confirm_plan(other, 'OTHER')

        self.client.force_authenticate(self.doctor)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [{'id': str(pending.id), 'name': pending.name}])

    def test_confirmed_status_without_finding_is_not_returned(self):
        patient = self.create_patient('Incomplete', self.doctor)
        Case.objects.create(
            patient=patient, specimen_id='INCOMPLETE', status=Case.Status.CONFIRMED,
        )
        self.client.force_authenticate(self.doctor)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_nurse_receives_pending_patients_from_the_same_hospital(self):
        same_hospital = self.create_patient('Same Hospital', self.other_doctor)
        self.confirm_plan(same_hospital, 'SAME-HOSPITAL')
        other_hospital = Hospital.objects.create(name='Other Hospital')
        outside = self.create_patient('Outside Patient', self.other_doctor, other_hospital)
        self.confirm_plan(outside, 'OTHER-HOSPITAL')

        self.client.force_authenticate(self.nurse)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data, [{'id': str(same_hospital.id), 'name': same_hospital.name}],
        )

    def test_patient_cannot_access(self):
        patient = self.create_patient('Patient User', self.doctor)
        self.client.force_authenticate(patient)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
