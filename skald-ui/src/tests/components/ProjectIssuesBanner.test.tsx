// @vitest-environment jsdom
/*
================================================================================
| SKB-009 (b) — where the live validation surfaces.                             |
|                                                                              |
| The verdict from useProjectIssues has to be somewhere the user cannot miss,   |
| because the alternative is the state this packet exists to fix: a project     |
| that will not build, and no sign of it until Generate is pressed.             |
================================================================================
*/
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectIssuesBanner } from '../../components/ProjectIssuesBanner';

afterEach(cleanup);

describe('ProjectIssuesBanner', () => {
    it('renders nothing when there is nothing wrong', () => {
        render(<ProjectIssuesBanner lines={[]} blocksBuild={false} />);
        expect(screen.queryByTestId('project-issues-banner')).toBeNull();
    });

    it('lists every line', () => {
        render(<ProjectIssuesBanner lines={['first problem', 'second problem']} blocksBuild={false} />);
        const banner = screen.getByTestId('project-issues-banner');
        expect(banner.textContent).toContain('first problem');
        expect(banner.textContent).toContain('second problem');
    });

    it('says outright that the build will fail when it will', () => {
        render(<ProjectIssuesBanner lines={['stale override']} blocksBuild />);
        expect(screen.getByTestId('project-issues-banner').textContent)
            .toContain('Code generation will fail');
    });

    it('does not claim a failure for a warning-only project', () => {
        render(<ProjectIssuesBanner lines={['a note will not sound']} blocksBuild={false} />);
        expect(screen.getByTestId('project-issues-banner').textContent)
            .not.toContain('Code generation will fail');
    });
});
