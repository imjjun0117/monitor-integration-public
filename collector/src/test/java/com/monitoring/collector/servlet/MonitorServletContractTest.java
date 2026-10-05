package com.monitoring.collector.servlet;

import org.junit.Test;
import static org.junit.Assert.*;

public class MonitorServletContractTest {
    @Test
    public void resultsAllowsOnlyJobIdOrSinceQueryParameters() {
        assertTrue(MonitorServlet.isAllowedResultsQuery(null));
        assertTrue(MonitorServlet.isAllowedResultsQuery("job_id=job-1"));
        assertTrue(MonitorServlet.isAllowedResultsQuery("since=2026-09-03T01%3A30%3A00Z"));
        assertFalse(MonitorServlet.isAllowedResultsQuery("unexpected=value"));
        assertFalse(MonitorServlet.isAllowedResultsQuery("job_id=one&since=two"));
        assertFalse(MonitorServlet.isAllowedResultsQuery("job_id=one&unexpected=value"));
    }

    @Test
    public void checkRunRejectsEveryUnknownTopLevelField() {
        assertTrue(
                MonitorServlet.acceptsRunRequestJson(
                        "{\"check_ids\":[\"health-check\"],\"requested_by\":\"agent\"}"));
        assertFalse(
                MonitorServlet.acceptsRunRequestJson(
                        "{\"check_ids\":[\"health-check\"],\"requested_by\":\"agent\",\"command\":\"whoami\"}"));
    }
}
