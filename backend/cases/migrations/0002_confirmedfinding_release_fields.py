import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="confirmedfinding",
            name="released_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="confirmedfinding",
            name="released_by",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"role": "doctor"},
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="released_findings",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
