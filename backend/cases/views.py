from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Case, NucleiPatch, GenePrediction
from .serializers import CaseListSerializer, CaseDetailSerializer
from .services import call_mosec_predict


@api_view(["GET", "POST"])
def case_list_create(request):
    if request.method == "GET":
        queryset = Case.objects.all()

        if status_param := request.query_params.get("status"):
            queryset = queryset.filter(status=status_param)

        if label_param := request.query_params.get("label"):
            queryset = queryset.filter(prediction_label=label_param)

        if search := request.query_params.get("search"):
            queryset = queryset.filter(specimen_id__icontains=search)

        serializer = CaseListSerializer(queryset, many=True)
        return Response(serializer.data)

    # POST
    specimen_id = request.data.get("specimen_id")
    slide_gcs_path = request.data.get("slide_gcs_path")

    if not specimen_id:
        return Response(
            {"error": "specimen_id는 필수입니다"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    case = Case.objects.create(
        user=request.user if request.user.is_authenticated else None,
        specimen_id=specimen_id,
        slide_gcs_path=slide_gcs_path,
        status="uploaded",
    )

    serializer = CaseDetailSerializer(case)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "DELETE"])
def case_detail(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response(
            {"error": "케이스를 찾을 수 없습니다"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        serializer = CaseDetailSerializer(case)
        return Response(serializer.data)

    # DELETE
    case.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def retry_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response(
            {"error": "케이스를 찾을 수 없습니다"},
            status=status.HTTP_404_NOT_FOUND,
        )

    case.status = "uploaded"
    case.save()

    return Response({
        "status": "reset",
        "case_id": str(case.id),
    })


@api_view(["POST"])
def predict_case(request, case_id):
    try:
        case = Case.objects.get(id=case_id)
    except Case.DoesNotExist:
        return Response(
            {"error": "케이스를 찾을 수 없습니다"},
            status=status.HTTP_404_NOT_FOUND,
        )

    case.status = "processing"
    case.save()

    try:
        result = call_mosec_predict(str(case.id), case.slide_gcs_path)
    except Exception as e:
        case.status = "failed"
        case.save()

        return Response(
            {"error": str(e)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    # Case 업데이트
    case.prediction_label = result["prediction_label"]
    case.luad_probability = result["luad_probability"]
    case.lusc_probability = result["lusc_probability"]
    case.heatmap_gcs_path = result["heatmap_gcs_path"]

    case.nuclei_density_score = result.get("nuclei_density_score")
    case.nuclei_density_level = result.get("nuclei_density_level")
    case.nuclei_irregularity_score = result.get("nuclei_irregularity_score")
    case.nuclei_irregularity_level = result.get("nuclei_irregularity_level")

    case.status = "completed"
    case.completed_at = timezone.now()
    case.save()

    # Patch 저장
    NucleiPatch.objects.filter(case=case).delete()

    for patch in result.get("nuclei_patches", []):
        NucleiPatch.objects.create(
            case=case,
            original_gcs_path=patch["original_gcs_path"],
            overlay_gcs_path=patch["overlay_gcs_path"],
            nuclei_count=patch["nuclei_count"],
            attention_rank=patch["attention_rank"],
        )

    # Gene 저장
    GenePrediction.objects.filter(case=case).delete()

    for gene in result.get("gene_predictions", []):
        GenePrediction.objects.create(
            case=case,
            gene_name=gene["gene_name"],
            likelihood=gene["likelihood"],
        )

    return Response({
        "status": "completed",
        "case_id": str(case.id),
    })