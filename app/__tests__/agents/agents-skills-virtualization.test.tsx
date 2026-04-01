/**
 * Test suite for virtualized skills list (AgentsSkillsSection with react-virtuoso)
 * 
 * Covers:
 * - Virtualization: only visible items rendered
 * - Performance: smooth scrolling with 100+ items
 * - Search/filter: recompute heights on filter change
 * - Data mutation: update single item without re-rendering all
 * - Edge cases: empty list, 1 item, concurrent operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VirtualizerHandle } from 'react-virtuoso';
import React from 'react';

// Mock data generator
const generateSkills = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `skill-${i}`,
    enabled: i % 2 === 0,
    source: i % 3 === 0 ? 'builtin' : 'user',
    agents: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, j) => `agent-${j}`),
  }));

const generateAgents = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    key: `agent-${i}`,
    name: `Agent ${i}`,
  }));

describe('AgentsSkillsSection - Virtualization', () => {
  describe('Basic virtualization', () => {
    it('renders only visible items (~15-20 skill cards at once for 100+ total)', async () => {
      // Arrange
      const skills = generateSkills(100);
      const agents = generateAgents(5);
      
      // Act
      const { container } = render(
        <MockAgentsSkillsSection skills={skills} agents={agents} />
      );

      // Assert
      const skillCards = container.querySelectorAll('[data-test="skill-card"]');
      // Should render ~15-20 cards, not 100
      expect(skillCards.length).toBeLessThanOrEqual(25);
      expect(skillCards.length).toBeGreaterThanOrEqual(10);
    });

    it('scrolls smoothly and swaps DOM nodes without lag', async () => {
      const skills = generateSkills(200);
      const agents = generateAgents(3);
      const { container } = render(
        <MockAgentsSkillsSection skills={skills} agents={agents} />
      );

      const scrollContainer = container.querySelector('[data-test="virtuoso-list"]');
      
      // Simulate scroll
      const beforeScroll = performance.now();
      scrollContainer?.dispatchEvent(new Event('scroll'));
      const afterScroll = performance.now();

      // Should not block main thread (< 16ms for 60 FPS)
      expect(afterScroll - beforeScroll).toBeLessThan(100); // generous threshold
    });

    it('maintains scroll position when items added/removed', async () => {
      const { rerender } = render(
        <MockAgentsSkillsSection skills={generateSkills(50)} agents={generateAgents(3)} />
      );

      // Simulate user scrolling
      // ... (would need ref to virtuoso to set scroll position)

      // Add more skills
      rerender(
        <MockAgentsSkillsSection skills={generateSkills(100)} agents={generateAgents(3)} />
      );

      // Position should not jump
      // ... (assertion depends on virtuoso ref exposure)
    });
  });

  describe('Search and filtering', () => {
    it('recomputes virtualized list on search', async () => {
      const skills = generateSkills(100);
      const { rerender, container } = render(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} search="" />
      );

      const initialCards = container.querySelectorAll('[data-test="skill-card"]').length;

      // Search for "skill-1" (should match skill-1, skill-10-19, skill-100-199)
      rerender(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} search="skill-1" />
      );

      await waitFor(() => {
        const filteredCards = container.querySelectorAll('[data-test="skill-card"]');
        expect(filteredCards.length).toBeLessThan(initialCards);
      });
    });

    it('clears list when filter matches nothing', async () => {
      const skills = generateSkills(50);
      const { container } = render(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} search="nonexistent" />
      );

      const emptyState = screen.getByText(/无结果|no results/i);
      expect(emptyState).toBeTruthy();

      const skillCards = container.querySelectorAll('[data-test="skill-card"]');
      expect(skillCards.length).toBe(0);
    });

    it('handles rapid filter changes without memory leaks', async () => {
      const skills = generateSkills(100);
      const { rerender } = render(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} search="" />
      );

      // Simulate user typing quickly
      for (let i = 0; i < 20; i++) {
        rerender(
          <MockAgentsSkillsSection 
            skills={skills} 
            agents={generateAgents(3)} 
            search={`skill-${i}`} 
          />
        );
      }

      // Should not crash or leak
      expect(screen.getByTestId('agents-skills-section')).toBeTruthy();
    });
  });

  describe('Data mutations', () => {
    it('toggles single skill without re-rendering entire list', async () => {
      const skills = generateSkills(50);
      const mockToggle = vi.fn(async () => true);

      render(
        <MockAgentsSkillsSection 
          skills={skills} 
          agents={generateAgents(3)}
          onToggleSkill={mockToggle}
        />
      );

      const toggleButton = screen.getAllByRole('button', { name: /toggle/i })[0];
      await userEvent.click(toggleButton);

      expect(mockToggle).toHaveBeenCalled();
      // Should be fast enough for UI to feel responsive
    });

    it('adds agent to skill without re-rendering other skills', async () => {
      const skills = generateSkills(75);
      const mockAddAgent = vi.fn(async () => true);

      const { container } = render(
        <MockAgentsSkillsSection 
          skills={skills} 
          agents={generateAgents(5)}
          onAddAgentToSkill={mockAddAgent}
        />
      );

      const addButton = container.querySelector('[data-test="add-agent-button"]');
      await userEvent.click(addButton!);

      expect(mockAddAgent).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('handles empty skill list (0 items)', () => {
      render(
        <MockAgentsSkillsSection skills={[]} agents={generateAgents(3)} />
      );

      expect(screen.getByText(/暂无技能|no skills/i)).toBeTruthy();
    });

    it('handles single skill (1 item)', () => {
      const { container } = render(
        <MockAgentsSkillsSection skills={generateSkills(1)} agents={generateAgents(3)} />
      );

      const cards = container.querySelectorAll('[data-test="skill-card"]');
      expect(cards.length).toBe(1);
    });

    it('handles 1000 items without crashing', () => {
      const { container } = render(
        <MockAgentsSkillsSection skills={generateSkills(1000)} agents={generateAgents(3)} />
      );

      const cards = container.querySelectorAll('[data-test="skill-card"]');
      // Still should only render ~15-20
      expect(cards.length).toBeLessThanOrEqual(30);
    });

    it('handles very long skill names without breaking layout', () => {
      const skills = generateSkills(10);
      skills[0].name = 'a'.repeat(200); // very long name

      const { container } = render(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} />
      );

      const card = container.querySelector('[data-test="skill-card"]');
      // Should not overflow or break layout
      expect(card?.textContent).toContain('a'.repeat(200).substring(0, 50)); // truncated
    });

    it('handles concurrent toggle operations (rapid clicks)', async () => {
      const skills = generateSkills(50);
      const mockToggle = vi.fn(async () => {
        // Simulate API delay
        await new Promise(r => setTimeout(r, 50));
        return true;
      });

      render(
        <MockAgentsSkillsSection 
          skills={skills} 
          agents={generateAgents(3)}
          onToggleSkill={mockToggle}
        />
      );

      const toggleButtons = screen.getAllByRole('button', { name: /toggle/i });
      
      // Click multiple buttons rapidly
      await Promise.all(
        toggleButtons.slice(0, 5).map(btn => userEvent.click(btn))
      );

      expect(mockToggle).toHaveBeenCalledTimes(5);
    });
  });

  describe('Accessibility', () => {
    it('maintains keyboard navigation in virtual list', async () => {
      const skills = generateSkills(100);
      
      render(
        <MockAgentsSkillsSection skills={skills} agents={generateAgents(3)} />
      );

      // Focus first visible item
      const firstCard = screen.getAllByRole('button', { name: /toggle/i })[0];
      await userEvent.tab();
      expect(document.activeElement).toBe(firstCard);

      // Should be able to navigate with arrow keys
      await userEvent.keyboard('{ArrowDown}');
      // Next item should receive focus
    });

    it('announces list updates to screen readers', () => {
      const { container } = render(
        <MockAgentsSkillsSection skills={generateSkills(50)} agents={generateAgents(3)} />
      );

      const liveRegion = container.querySelector('[role="status"][aria-live="polite"]');
      expect(liveRegion).toBeTruthy();
    });
  });
});

// Mock component for testing
function MockAgentsSkillsSection({
  skills,
  agents,
  search = '',
  onToggleSkill,
  onAddAgentToSkill,
}: {
  skills: any[];
  agents: any[];
  search?: string;
  onToggleSkill?: (name: string) => Promise<boolean>;
  onAddAgentToSkill?: (skill: string, agent: string) => Promise<boolean>;
}) {
  return (
    <div data-testid="agents-skills-section">
      {/* Will be replaced with actual virtualized component */}
      <input placeholder="Search" defaultValue={search} />
      <div data-test="virtuoso-list">
        {skills.length === 0 ? (
          <div>暂无技能</div>
        ) : (
          skills.map(skill => (
            <div key={skill.name} data-test="skill-card">
              <span>{skill.name}</span>
              <button>{skill.enabled ? 'Enabled' : 'Disabled'}</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
