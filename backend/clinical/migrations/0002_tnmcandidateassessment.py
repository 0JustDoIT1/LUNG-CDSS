import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("cases", "0003_casereanalysisrequest"), ("clinical", "0001_initial"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name="TnmCandidateAssessment", fields=[
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("t_candidate", models.CharField(max_length=8)), ("n_candidate", models.CharField(max_length=8)),
        ("m_candidate", models.CharField(max_length=20)), ("stage_group_candidate", models.CharField(blank=True, max_length=30, null=True)),
        ("imaging_evidence", models.JSONField(default=dict)), ("result", models.JSONField(default=dict)), ("created_at", models.DateTimeField(auto_now_add=True)),
        ("case", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tnm_assessments", to="cases.case")),
        ("doctor", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="tnm_candidate_assessments", to=settings.AUTH_USER_MODEL)),
    ], options={"ordering": ["-created_at"]})]
