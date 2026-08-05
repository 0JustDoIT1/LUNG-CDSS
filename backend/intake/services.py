from copy import deepcopy

from .models import IntakeForm, IntakeTemplate


def active_template():
    return IntakeTemplate.objects.filter(is_active=True).first()


def draft_content_from_template():
    template = active_template()
    questions = deepcopy(template.questions) if template else []
    return {'status': 'draft', 'questions': questions}


def get_or_prepare_intake_form(patient):
    form, created = IntakeForm.objects.get_or_create(
        patient=patient,
        defaults={'content': draft_content_from_template()},
    )
    content = form.content or {}
    if (
        not created
        and content.get('status') == 'draft'
        and not content.get('questions')
    ):
        prepared = draft_content_from_template()
        if prepared['questions']:
            form.content = prepared
            form.save(update_fields=['content', 'updated_at'])
    return form
