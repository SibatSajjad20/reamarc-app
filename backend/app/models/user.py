from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    HR = "hr"
    TEAM_LEAD = "team_lead"
    TEAM_MEMBER = "team_member"
    CLIENT = "client"
    MEMBER = "team_member"

class Department(str, Enum):
    WEBSITE = "website"
    CREATIVE = "creative"
    CONTENT = "content"
    SEO = "seo"
    PERFORMANCE_MARKETING = "performance marketing"
    AI = "AI"
