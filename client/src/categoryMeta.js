import {
  Users,
  Shield,
  TicketCheck,
  FlaskConical,
  Database,
  Cog,
} from 'lucide-react';

export const CATEGORY_META = {
  'user-management': {
    label: 'User Management',
    icon: Users,
    description: 'Batch user registration, password reset, and tier upgrades',
  },
  'user-auth': {
    label: 'User Auth',
    icon: Shield,
    description: 'Role/privilege management and email operations',
  },
  jira: {
    label: 'Jira & TestRail',
    icon: TicketCheck,
    description: 'Jira issue management and TestRail reporting',
  },
  testing: {
    label: 'Testing',
    icon: FlaskConical,
    description: 'TestRail section/case management and HTTP testing',
  },
  database: {
    label: 'Database',
    icon: Database,
    description: 'Account ID maintenance in member database',
  },
  automation: {
    label: 'Automation',
    icon: Cog,
    description: 'Utility tools for day-to-day QA automation tasks',
  },
};
