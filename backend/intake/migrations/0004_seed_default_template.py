from copy import deepcopy

from django.db import migrations

from intake.default_template import (
    DEFAULT_QUESTIONS,
    DEFAULT_TEMPLATE_NAME,
    DEFAULT_TEMPLATE_VERSION,
)


def seed_default_template(apps, schema_editor):
    IntakeTemplate = apps.get_model('intake', 'IntakeTemplate')
    IntakeTemplate.objects.update(is_active=False)
    IntakeTemplate.objects.update_or_create(
        name=DEFAULT_TEMPLATE_NAME,
        version=DEFAULT_TEMPLATE_VERSION,
        defaults={'questions': deepcopy(DEFAULT_QUESTIONS), 'is_active': True},
    )


def remove_default_template(apps, schema_editor):
    IntakeTemplate = apps.get_model('intake', 'IntakeTemplate')
    IntakeTemplate.objects.filter(
        name=DEFAULT_TEMPLATE_NAME, version=DEFAULT_TEMPLATE_VERSION,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [('intake', '0003_intaketemplate')]

    operations = [
        migrations.RunPython(seed_default_template, remove_default_template),
    ]
