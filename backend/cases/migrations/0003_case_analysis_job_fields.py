from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0002_confirmedfinding_release_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="analysis_error_code",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="case",
            name="analysis_error_message",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="case",
            name="analysis_task_id",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="case",
            name="last_progress_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="retry_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
