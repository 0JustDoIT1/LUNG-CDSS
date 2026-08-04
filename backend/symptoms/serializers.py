from rest_framework import serializers

from .models import SymptomCheck


class SymptomSubmitSerializer(serializers.Serializer):
    """
    체크리스트 원시입력. 항목명은 프론트 화면기획과 동일하게 맞춤:
    기침/호흡곤란/객혈/흉통/발열/체중감소/식욕/피로도.
    """
    cough = serializers.ChoiceField(choices=["없음", "약간", "심함"])
    dyspnea = serializers.ChoiceField(choices=["없음", "활동시만", "안정시에도"])
    hemoptysis = serializers.ChoiceField(choices=["없음", "소량", "다량"])
    chest_pain = serializers.ChoiceField(choices=["없음", "약간", "심함"])
    fever = serializers.ChoiceField(choices=["없음", "37.5~38", "38이상"])
    weight_loss = serializers.ChoiceField(choices=["없음", "있음"])
    appetite = serializers.ChoiceField(choices=["평소와 같음", "감소"])
    fatigue = serializers.ChoiceField(choices=["없음", "약간", "심함"])


class SymptomCheckSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.name", read_only=True)

    class Meta:
        model = SymptomCheck
        fields = [
            "id", "patient_name", "checked_at", "symptoms", "risk_level",
            "visible_to_nurse", "nurse_reviewed", "nurse_reviewed_at",
        ]
        read_only_fields = fields
