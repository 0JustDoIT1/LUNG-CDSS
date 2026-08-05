from datetime import datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import DoctorProfile, Hospital, User

from .models import Appointment


class AppointmentLookupApiTests(APITestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Test Hospital")
        self.patient = User.objects.create_patient(name="Patient One")
        self.doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor One")
        DoctorProfile.objects.create(
            user=self.doctor,
            license_number="DOC001",
            department="호흡기내과",
            hospital=hospital,
        )
        self.client.force_authenticate(self.patient)
        self.date = timezone.localdate() + timedelta(days=2)

    def test_departments_and_doctors_have_documented_object_shape(self):
        departments = self.client.get(reverse("appt-departments"))
        doctors = self.client.get(reverse("appt-doctors"), {"department": "호흡기내과"})

        self.assertEqual(departments.status_code, status.HTTP_200_OK)
        self.assertEqual(departments.data, [{"code": "호흡기내과", "name": "호흡기내과"}])
        self.assertEqual(doctors.status_code, status.HTTP_200_OK)
        self.assertEqual(doctors.data[0]["id"], str(self.doctor.id))
        self.assertEqual(doctors.data[0]["department"], "호흡기내과")

    def test_slots_include_available_and_closed_statuses(self):
        slot_at = timezone.make_aware(datetime.combine(self.date, time(9, 0)))
        Appointment.objects.create(
            patient=self.patient,
            doctor=self.doctor,
            department="호흡기내과",
            requested_at_slot=slot_at,
        )

        response = self.client.get(
            reverse("appt-slots", args=[self.doctor.id]),
            {"date": self.date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["timezone"], "Asia/Seoul")
        statuses = {slot["time"]: slot["status"] for slot in response.data["slots"]}
        self.assertEqual(statuses["09:00"], "closed")
        self.assertIn("available", statuses.values())


class AppointmentSlotConstraintTests(TestCase):
    def test_active_slot_cannot_be_booked_twice(self):
        hospital = Hospital.objects.create(name="Constraint Hospital")
        patient_one = User.objects.create_patient(name="Patient One")
        patient_two = User.objects.create_patient(name="Patient Two")
        doctor = User.objects.create_staff(User.Role.DOCTOR, "Doctor One")
        DoctorProfile.objects.create(
            user=doctor,
            license_number="DOC002",
            department="호흡기내과",
            hospital=hospital,
        )
        slot_at = timezone.now() + timedelta(days=2)
        Appointment.objects.create(
            patient=patient_one,
            doctor=doctor,
            department="호흡기내과",
            requested_at_slot=slot_at,
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Appointment.objects.create(
                patient=patient_two,
                doctor=doctor,
                department="호흡기내과",
                requested_at_slot=slot_at,
            )
