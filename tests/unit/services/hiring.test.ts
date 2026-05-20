import { describe, it, expect } from 'vitest';

// Hiring pipeline business logic functions

type PipelineStage = 'APPLIED' | 'SCREENING' | 'PHONE' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';

const VALID_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  APPLIED: ['SCREENING', 'REJECTED'],
  SCREENING: ['PHONE', 'REJECTED'],
  PHONE: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['OFFER', 'REJECTED'],
  OFFER: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
};

function validateStageTransition(
  currentStage: PipelineStage,
  targetStage: PipelineStage
): boolean {
  return VALID_TRANSITIONS[currentStage]?.includes(targetStage) ?? false;
}

function moveCandidate(
  candidate: any,
  newStage: PipelineStage,
  movedBy: string,
  notes?: string
): any {
  if (!validateStageTransition(candidate.stage, newStage)) {
    throw new Error(
      `Invalid transition from ${candidate.stage} to ${newStage}`
    );
  }

  return {
    ...candidate,
    stage: newStage,
    lastMovedAt: new Date(),
    lastMovedBy: movedBy,
    notes: notes ? `${candidate.notes || ''}\n${notes}` : candidate.notes,
  };
}

function calculateCandidateScore(ratings: Array<{ score: number; maxScore: number }>): number {
  if (ratings.length === 0) return 0;
  const totalScore = ratings.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0);
  return Math.round(totalScore / ratings.length);
}

function aggregateInterviewScores(
  interviews: Array<{ rating: number; maxRating: number }>
): { averageScore: number; normalizedScore: number } {
  if (interviews.length === 0) {
    return { averageScore: 0, normalizedScore: 0 };
  }

  const normalizedScores = interviews.map(i => (i.rating / i.maxRating) * 100);
  const averageScore = normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length;

  return {
    averageScore: Math.round(averageScore),
    normalizedScore: averageScore,
  };
}

function evaluateCandidateQuality(score: number): string {
  if (score >= 90) return 'EXCEPTIONAL';
  if (score >= 75) return 'STRONG';
  if (score >= 60) return 'ACCEPTABLE';
  return 'NEEDS_IMPROVEMENT';
}

function createCandidate(data: {
  firstName: string;
  lastName: string;
  email: string;
  position: string;
  appliedDate: Date;
}): any {
  if (!data.firstName?.trim()) throw new Error('First name required');
  if (!data.lastName?.trim()) throw new Error('Last name required');
  if (!data.email?.includes('@')) throw new Error('Valid email required');
  if (!data.position?.trim()) throw new Error('Position required');

  return {
    id: 'cand-' + Math.random().toString(36).substr(2, 9),
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    position: data.position,
    stage: 'APPLIED',
    appliedDate: data.appliedDate,
    score: 0,
    createdAt: new Date(),
  };
}

describe('Hiring Pipeline Service', () => {
  // Stage transitions
  describe('validateStageTransition()', () => {
    it('should allow APPLIED to SCREENING', () => {
      expect(validateStageTransition('APPLIED', 'SCREENING')).toBe(true);
    });

    it('should allow APPLIED to REJECTED', () => {
      expect(validateStageTransition('APPLIED', 'REJECTED')).toBe(true);
    });

    it('should reject APPLIED to OFFER', () => {
      expect(validateStageTransition('APPLIED', 'OFFER')).toBe(false);
    });

    it('should allow SCREENING to PHONE', () => {
      expect(validateStageTransition('SCREENING', 'PHONE')).toBe(true);
    });

    it('should reject SCREENING to APPLIED', () => {
      expect(validateStageTransition('SCREENING', 'APPLIED')).toBe(false);
    });

    it('should allow PHONE to INTERVIEW', () => {
      expect(validateStageTransition('PHONE', 'INTERVIEW')).toBe(true);
    });

    it('should allow INTERVIEW to OFFER', () => {
      expect(validateStageTransition('INTERVIEW', 'OFFER')).toBe(true);
    });

    it('should allow OFFER to HIRED', () => {
      expect(validateStageTransition('OFFER', 'HIRED')).toBe(true);
    });

    it('should reject HIRED transitions', () => {
      expect(validateStageTransition('HIRED', 'APPLIED')).toBe(false);
      expect(validateStageTransition('HIRED', 'REJECTED')).toBe(false);
    });

    it('should reject REJECTED transitions', () => {
      expect(validateStageTransition('REJECTED', 'SCREENING')).toBe(false);
    });

    it('should not allow skipping stages', () => {
      expect(validateStageTransition('APPLIED', 'INTERVIEW')).toBe(false);
      expect(validateStageTransition('APPLIED', 'HIRED')).toBe(false);
    });
  });

  // Moving candidates
  describe('moveCandidate()', () => {
    const mockCandidate = {
      id: 'cand-123',
      firstName: 'John',
      lastName: 'Doe',
      stage: 'APPLIED',
      notes: 'Initial application',
    };

    it('should move candidate to new valid stage', () => {
      const result = moveCandidate(mockCandidate, 'SCREENING', 'user-123');
      expect(result.stage).toBe('SCREENING');
    });

    it('should throw error for invalid transition', () => {
      expect(() => moveCandidate(mockCandidate, 'OFFER', 'user-123')).toThrow(
        'Invalid transition'
      );
    });

    it('should record who moved candidate', () => {
      const result = moveCandidate(mockCandidate, 'SCREENING', 'user-456');
      expect(result.lastMovedBy).toBe('user-456');
    });

    it('should set timestamp of move', () => {
      const result = moveCandidate(mockCandidate, 'SCREENING', 'user-123');
      expect(result.lastMovedAt).toBeInstanceOf(Date);
    });

    it('should preserve existing notes and add new ones', () => {
      const result = moveCandidate(
        mockCandidate,
        'SCREENING',
        'user-123',
        'Passed initial review'
      );
      expect(result.notes).toContain('Initial application');
      expect(result.notes).toContain('Passed initial review');
    });

    it('should allow moving through pipeline', () => {
      let candidate = mockCandidate;
      candidate = moveCandidate(candidate, 'SCREENING', 'user-123');
      candidate = moveCandidate(candidate, 'PHONE', 'user-123');
      candidate = moveCandidate(candidate, 'INTERVIEW', 'user-123');
      expect(candidate.stage).toBe('INTERVIEW');
    });

    it('should reject invalid rejection from SCREENING', () => {
      const result = moveCandidate(mockCandidate, 'SCREENING', 'user-123');
      const rejected = moveCandidate(result, 'REJECTED', 'user-123');
      expect(rejected.stage).toBe('REJECTED');
    });
  });

  // Candidate scoring
  describe('calculateCandidateScore()', () => {
    it('should average multiple ratings', () => {
      const ratings = [
        { score: 8, maxScore: 10 },
        { score: 9, maxScore: 10 },
        { score: 7, maxScore: 10 },
      ];
      const score = calculateCandidateScore(ratings);
      expect(score).toBe(80);
    });

    it('should normalize different max scores', () => {
      const ratings = [
        { score: 5, maxScore: 5 }, // 100%
        { score: 75, maxScore: 100 }, // 75%
      ];
      const score = calculateCandidateScore(ratings);
      expect(score).toBe(88);
    });

    it('should return 0 for empty ratings', () => {
      const score = calculateCandidateScore([]);
      expect(score).toBe(0);
    });

    it('should handle single rating', () => {
      const ratings = [{ score: 8, maxScore: 10 }];
      const score = calculateCandidateScore(ratings);
      expect(score).toBe(80);
    });

    it('should round to nearest integer', () => {
      const ratings = [
        { score: 5, maxScore: 10 },
        { score: 6, maxScore: 10 },
      ];
      const score = calculateCandidateScore(ratings);
      expect(Number.isInteger(score)).toBe(true);
    });
  });

  // Interview score aggregation
  describe('aggregateInterviewScores()', () => {
    it('should calculate average of multiple interviews', () => {
      const interviews = [
        { rating: 8, maxRating: 10 },
        { rating: 9, maxRating: 10 },
        { rating: 7, maxRating: 10 },
      ];
      const result = aggregateInterviewScores(interviews);
      expect(result.averageScore).toBe(80);
    });

    it('should normalize different rating scales', () => {
      const interviews = [
        { rating: 4, maxRating: 5 }, // 80%
        { rating: 90, maxRating: 100 }, // 90%
      ];
      const result = aggregateInterviewScores(interviews);
      expect(result.averageScore).toBe(85);
    });

    it('should return 0 for empty interviews', () => {
      const result = aggregateInterviewScores([]);
      expect(result.averageScore).toBe(0);
      expect(result.normalizedScore).toBe(0);
    });

    it('should handle single interview', () => {
      const interviews = [{ rating: 8, maxRating: 10 }];
      const result = aggregateInterviewScores(interviews);
      expect(result.averageScore).toBe(80);
    });

    it('should return both average and normalized scores', () => {
      const interviews = [
        { rating: 7.5, maxRating: 10 },
        { rating: 8.5, maxRating: 10 },
      ];
      const result = aggregateInterviewScores(interviews);
      expect(result.averageScore).toBeDefined();
      expect(result.normalizedScore).toBeDefined();
    });
  });

  // Quality evaluation
  describe('evaluateCandidateQuality()', () => {
    it('should rate 90+ as EXCEPTIONAL', () => {
      expect(evaluateCandidateQuality(95)).toBe('EXCEPTIONAL');
      expect(evaluateCandidateQuality(100)).toBe('EXCEPTIONAL');
    });

    it('should rate 75-89 as STRONG', () => {
      expect(evaluateCandidateQuality(75)).toBe('STRONG');
      expect(evaluateCandidateQuality(85)).toBe('STRONG');
      expect(evaluateCandidateQuality(89)).toBe('STRONG');
    });

    it('should rate 60-74 as ACCEPTABLE', () => {
      expect(evaluateCandidateQuality(60)).toBe('ACCEPTABLE');
      expect(evaluateCandidateQuality(70)).toBe('ACCEPTABLE');
    });

    it('should rate below 60 as NEEDS_IMPROVEMENT', () => {
      expect(evaluateCandidateQuality(50)).toBe('NEEDS_IMPROVEMENT');
      expect(evaluateCandidateQuality(0)).toBe('NEEDS_IMPROVEMENT');
    });

    it('should handle boundary values', () => {
      expect(evaluateCandidateQuality(90)).toBe('EXCEPTIONAL');
      expect(evaluateCandidateQuality(89.9)).toBe('STRONG');
      expect(evaluateCandidateQuality(75)).toBe('STRONG');
      expect(evaluateCandidateQuality(74.9)).toBe('ACCEPTABLE');
    });
  });

  // Creating candidates
  describe('createCandidate()', () => {
    it('should create candidate with valid data', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      const candidate = createCandidate(data);
      expect(candidate.firstName).toBe('Jane');
      expect(candidate.stage).toBe('APPLIED');
    });

    it('should throw error for missing first name', () => {
      const data = {
        firstName: '',
        lastName: 'Smith',
        email: 'jane@example.com',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      expect(() => createCandidate(data)).toThrow('First name required');
    });

    it('should throw error for missing last name', () => {
      const data = {
        firstName: 'Jane',
        lastName: '',
        email: 'jane@example.com',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      expect(() => createCandidate(data)).toThrow('Last name required');
    });

    it('should throw error for invalid email', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'invalid-email',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      expect(() => createCandidate(data)).toThrow('Valid email required');
    });

    it('should throw error for missing position', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        position: '',
        appliedDate: new Date(),
      };
      expect(() => createCandidate(data)).toThrow('Position required');
    });

    it('should generate unique candidate ID', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      const candidate1 = createCandidate(data);
      const candidate2 = createCandidate({
        ...data,
        email: 'jane2@example.com',
      });
      expect(candidate1.id).not.toBe(candidate2.id);
    });

    it('should start with APPLIED stage', () => {
      const data = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        position: 'Software Engineer',
        appliedDate: new Date(),
      };
      const candidate = createCandidate(data);
      expect(candidate.stage).toBe('APPLIED');
    });
  });

  // Pipeline progression edge cases
  describe('Hiring pipeline edge cases', () => {
    it('should allow candidate to move from OFFER to HIRED', () => {
      const candidate = {
        id: 'cand-123',
        stage: 'OFFER' as const,
      };
      const result = moveCandidate(candidate, 'HIRED', 'user-123');
      expect(result.stage).toBe('HIRED');
    });

    it('should prevent moving from HIRED', () => {
      const candidate = {
        id: 'cand-123',
        stage: 'HIRED' as const,
      };
      expect(() => moveCandidate(candidate, 'REJECTED', 'user-123')).toThrow();
    });

    it('should track multiple stage transitions', () => {
      let candidate = {
        id: 'cand-123',
        stage: 'APPLIED' as const,
        notes: '',
      };

      const stages: PipelineStage[] = ['SCREENING', 'PHONE', 'INTERVIEW', 'OFFER'];

      stages.forEach((stage, index) => {
        candidate = moveCandidate(
          candidate,
          stage,
          'user-123',
          `Step ${index + 1}`
        );
      });

      expect(candidate.stage).toBe('OFFER');
      expect(candidate.notes).toContain('Step 4');
    });

    it('should handle rejection at any stage', () => {
      const stages: PipelineStage[] = ['APPLIED', 'SCREENING', 'PHONE', 'INTERVIEW'];

      stages.forEach(stage => {
        const candidate = { id: 'cand-123', stage, notes: '' };
        const rejected = moveCandidate(candidate, 'REJECTED', 'user-123');
        expect(rejected.stage).toBe('REJECTED');
      });
    });
  });
});
