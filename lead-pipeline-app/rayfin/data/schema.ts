import { Todo } from './Todo.js';
import { Rep } from './Rep.js';
import { LeadSource } from './LeadSource.js';
import { Lead } from './Lead.js';
import { StageEvent } from './StageEvent.js';
import { Quote } from './Quote.js';
import { MetricKpi } from './MetricKpi.js';
import { MetricFunnel } from './MetricFunnel.js';
import { MetricTrend } from './MetricTrend.js';
import { MetricRep } from './MetricRep.js';
import { MetricSource } from './MetricSource.js';
import { MetricLead } from './MetricLead.js';

export type TodoAppSchema = {
  Todo: Todo;
  Rep: Rep;
  LeadSource: LeadSource;
  Lead: Lead;
  StageEvent: StageEvent;
  Quote: Quote;
  MetricKpi: MetricKpi;
  MetricFunnel: MetricFunnel;
  MetricTrend: MetricTrend;
  MetricRep: MetricRep;
  MetricSource: MetricSource;
  MetricLead: MetricLead;
};

export const schema = [
  Todo, Rep, LeadSource, Lead, StageEvent, Quote,
  MetricKpi, MetricFunnel, MetricTrend, MetricRep, MetricSource, MetricLead,
];
