export const APIRoutes = {
  GetAgents: (agentOSUrl: string) => `${agentOSUrl}/agents`,
  AgentRun: (agentOSUrl: string) => `${agentOSUrl}/agents/{agent_id}/runs`,
  Status: (agentOSUrl: string) => `${agentOSUrl}/health`,
  GetSessions: (agentOSUrl: string) => `${agentOSUrl}/sessions`,
  GetSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}/runs`,

  DeleteSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}`,

  GetTeams: (agentOSUrl: string) => `${agentOSUrl}/teams`,
  TeamRun: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs`,
  DeleteTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    `${agentOSUrl}/v1//teams/${teamId}/sessions/${sessionId}`,
  LoadKnowledge: (agentOSUrl: string) => `${agentOSUrl}/api/knowledge/load`,
  Dashboards: (agentOSUrl: string) => `${agentOSUrl}/api/dashboards`,
  Dashboard: (agentOSUrl: string, dashboardId: string) =>
    `${agentOSUrl}/api/dashboards/${dashboardId}`,
  RefreshDashboard: (agentOSUrl: string, dashboardId: string) =>
    `${agentOSUrl}/api/dashboards/${dashboardId}/refresh`,
  Login: (agentOSUrl: string) => `${agentOSUrl}/auth/login`,
  RecoverPassword: (agentOSUrl: string) => `${agentOSUrl}/auth/recover`
}
