from .models import AuditLog


def record_audit(*, actor, action, resource_type, resource_id, metadata=None):
    return AuditLog.objects.create(
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        metadata=metadata or {},
    )
