from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import IntakeForm


@extend_schema_field({
    "oneOf": [
        {"type": "string"},
        {"type": "array", "items": {"type": "string"}},
        {"type": "null"},
    ],
})
class IntakeAnswerField(serializers.JSONField):
    pass


class IntakeQuestionSerializer(serializers.Serializer):
    question_id = serializers.CharField(max_length=100)
    question_text = serializers.CharField()
    question_type = serializers.ChoiceField(
        choices=["single_choice", "multiple_choice", "text"],
    )
    options = serializers.ListField(
        child=serializers.CharField(), required=False, default=list,
    )
    required = serializers.BooleanField(default=False)
    answer = IntakeAnswerField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        question_type = attrs["question_type"]
        options = attrs.get("options", [])
        answer = attrs.get("answer")

        if question_type in ("single_choice", "multiple_choice") and not options:
            raise serializers.ValidationError({"options": "선택형 질문에는 선택지가 필요합니다."})
        if question_type == "text" and options:
            raise serializers.ValidationError({"options": "주관식 질문에는 선택지를 사용할 수 없습니다."})
        if answer is None:
            return attrs
        if question_type in ("single_choice", "text"):
            if not isinstance(answer, str):
                raise serializers.ValidationError({"answer": "문자열이어야 합니다."})
            if question_type == "single_choice" and answer not in options:
                raise serializers.ValidationError({"answer": "선택지 중 하나를 선택해주세요."})
        elif not isinstance(answer, list) or any(not isinstance(item, str) for item in answer):
            raise serializers.ValidationError({"answer": "문자열 배열이어야 합니다."})
        elif any(item not in options for item in answer):
            raise serializers.ValidationError({"answer": "선택지에 없는 값이 포함되어 있습니다."})
        return attrs


class IntakeContentSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["draft", "submitted"])
    questions = IntakeQuestionSerializer(many=True)

    def validate(self, attrs):
        questions = attrs["questions"]
        question_ids = [question["question_id"] for question in questions]
        if len(question_ids) != len(set(question_ids)):
            raise serializers.ValidationError({"questions": "question_id는 중복될 수 없습니다."})
        if attrs["status"] == "submitted":
            missing = [
                question["question_id"]
                for question in questions
                if question.get("required")
                and question.get("answer") in (None, "", [])
            ]
            if missing:
                raise serializers.ValidationError({
                    "questions": f"필수 질문에 답변해주세요: {', '.join(missing)}",
                })
        return attrs


class IntakeAnswerUpdateSerializer(serializers.Serializer):
    question_id = serializers.CharField(max_length=100)
    answer = IntakeAnswerField(allow_null=True)


class IntakeContentUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['draft', 'submitted'])
    questions = IntakeAnswerUpdateSerializer(many=True)

    def validate_questions(self, questions):
        question_ids = [question['question_id'] for question in questions]
        if len(question_ids) != len(set(question_ids)):
            raise serializers.ValidationError('question_id는 중복될 수 없습니다.')
        return questions


class IntakeFormUpdateSerializer(serializers.Serializer):
    content = IntakeContentUpdateSerializer()


class IntakeFormSerializer(serializers.ModelSerializer):
    content = IntakeContentSerializer()

    class Meta:
        model = IntakeForm
        fields = ["id", "content", "submitted_at", "updated_at"]
        read_only_fields = ["id", "submitted_at", "updated_at"]
