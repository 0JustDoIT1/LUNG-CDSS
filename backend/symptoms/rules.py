from .models import SymptomCheck


def compute_risk_level(symptoms: dict) -> str:
    """
    IF 객혈="다량" OR (호흡곤란="안정시에도" AND 발열="38이상") → RED
    IF 객혈="소량" OR 흉통="심함" OR 발열="37.5~38" → YELLOW
    ELSE → GREEN
    """
    if symptoms.get("hemoptysis") == "다량" or (
        symptoms.get("dyspnea") == "안정시에도" and symptoms.get("fever") == "38이상"
    ):
        return SymptomCheck.RiskLevel.RED

    if (
        symptoms.get("hemoptysis") == "소량"
        or symptoms.get("chest_pain") == "심함"
        or symptoms.get("fever") == "37.5~38"
    ):
        return SymptomCheck.RiskLevel.YELLOW

    return SymptomCheck.RiskLevel.GREEN
