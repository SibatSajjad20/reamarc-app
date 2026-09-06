from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    HR = "hr"
    OPERATIONS = "operations"
    TEAM_LEAD = "team_lead"
    TEAM_MEMBER = "team_member"
    CLIENT = "client"
    MEMBER = "team_member"

class EmploymentType(str, Enum):
    PROBATION = "probation"
    CONTRACT = "contract"

class Department(str, Enum):
    WEBSITE = "website"
    CREATIVE = "creative"
    CONTENT = "content"
    SEO = "seo"
    PERFORMANCE_MARKETING = "performance marketing"
    AI = "AI"
    SOFTWARE_DEVELOPMENT = "software development"

