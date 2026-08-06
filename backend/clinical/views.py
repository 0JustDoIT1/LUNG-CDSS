from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import IsDoctor
from appointments.models import Appointment
from cases.models import Case
from medications.models import MedicationSchedule
from core.responses import error_response, validation_error_response

from .models import AuditLog, ClinicalNote, Prescription
from .serializers import AuditLogSerializer, ClinicalNoteSerializer, PrescriptionSerializer
from .services import record_audit


def _patient_or_404(patient_id):
    return User.objects.filter(id=patient_id, role=User.Role.PATIENT, is_active=True).first()


@api_view(["GET"])
@permission_classes([IsDoctor])
def patient_detail(request, patient_id):
    patient = _patient_or_404(patient_id)
    if patient is None:
        return error_response("환자를 찾을 수 없습니다.", status_code=status.HTTP_404_NOT_FOUND)
    profile = getattr(patient, "patient_profile", None)
    cases = Case.objects.filter(patient=patient).order_by("-uploaded_at")[:10]
    appointments = Appointment.objects.filter(patient=patient, doctor=request.user).order_by("-requested_at_slot")[:10]
    medications = MedicationSchedule.objects.filter(patient=patient).order_by("-start_date")[:20]
    return Response({
        "id": str(patient.id),
        "name": patient.name,
        "patient_number": getattr(profile, "patient_number", None),
        "birth_date": getattr(profile, "birth_date", None),
        "gender": getattr(profile, "gender", None),
        "cases": [{"id": str(c.id), "specimen_id": c.specimen_id, "status": c.status, "uploaded_at": c.uploaded_at} for c in cases],
        "appointments": [{"id": str(a.id), "requested_at_slot": a.requested_at_slot, "confirmed_slot": a.confirmed_slot, "status": a.status, "department": a.department} for a in appointments],
        "medications": [{"id": str(m.id), "drug_name": m.drug_name, "dosage": m.dosage, "start_date": m.start_date, "end_date": m.end_date} for m in medications],
    })


@api_view(["GET", "POST"])
@permission_classes([IsDoctor])
def clinical_notes(request, patient_id):
    patient = _patient_or_404(patient_id)
    if patient is None:
        return error_response("환자를 찾을 수 없습니다.", status_code=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        rows = ClinicalNote.objects.filter(patient=patient).select_related("doctor")
        return Response(ClinicalNoteSerializer(rows, many=True).data)
    serializer = ClinicalNoteSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    note = serializer.save(patient=patient, doctor=request.user)
    record_audit(actor=request.user, action="clinical_note.created", resource_type="clinical_note", resource_id=note.id, metadata={"patient_id": str(patient.id)})
    return Response(ClinicalNoteSerializer(note).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsDoctor])
def prescriptions(request, patient_id):
    patient = _patient_or_404(patient_id)
    if patient is None:
        return error_response("환자를 찾을 수 없습니다.", status_code=status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        rows = Prescription.objects.filter(patient=patient).select_related("doctor")
        return Response(PrescriptionSerializer(rows, many=True).data)
    serializer = PrescriptionSerializer(data=request.data)
    if not serializer.is_valid():
        return validation_error_response(serializer.errors)
    prescription = serializer.save(patient=patient, doctor=request.user)
    record_audit(actor=request.user, action="prescription.created", resource_type="prescription", resource_id=prescription.id, metadata={"patient_id": str(patient.id)})
    return Response(PrescriptionSerializer(prescription).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsDoctor])
def audit_logs(request):
    logs = AuditLog.objects.select_related("actor")
    patient_id = request.query_params.get("patient_id")
    if patient_id:
        logs = logs.filter(metadata__patient_id=patient_id)
    logs = logs[:200]
    return Response(AuditLogSerializer(logs, many=True).data)
