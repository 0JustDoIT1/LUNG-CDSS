from django.db import migrations, models


def populate_legacy_device_ids(apps, schema_editor):
    DeviceToken = apps.get_model("accounts", "DeviceToken")
    for token in DeviceToken.objects.filter(device_id="").iterator():
        token.device_id = f"legacy-{token.id}"
        token.save(update_fields=["device_id"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_remove_doctorprofile_license_verified_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="devicetoken",
            name="device_id",
            field=models.CharField(blank=True, default="", max_length=255),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="devicetoken",
            name="device_name",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(populate_legacy_device_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="devicetoken",
            name="device_id",
            field=models.CharField(max_length=255),
        ),
        migrations.AddConstraint(
            model_name="devicetoken",
            constraint=models.UniqueConstraint(
                fields=("user", "app_type", "device_id"),
                name="uniq_user_app_device",
            ),
        ),
    ]
