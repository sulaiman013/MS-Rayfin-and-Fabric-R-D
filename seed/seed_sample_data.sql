-- Sample data for the Lead-to-Install Pipeline POC.
-- Run in the Fabric SQL database query editor AFTER `npx rayfin up` creates the tables.
-- If the generated schema differs (extra columns, different casing), adjust accordingly.
-- All emails and phone numbers below are fictional.

-- ----- Reps -----
DECLARE @repA UNIQUEIDENTIFIER = NEWID();
DECLARE @repB UNIQUEIDENTIFIER = NEWID();
DECLARE @repC UNIQUEIDENTIFIER = NEWID();

INSERT INTO Rep (id, name, email, showroom, active, createdAt) VALUES
(@repA, 'Maria Lopez',  'maria@example.com',  'austin', 1, '2025-01-05'),
(@repB, 'Devon Carter', 'devon@example.com',  'la',     1, '2025-01-05'),
(@repC, 'Priya Shah',   'priya@example.com',  'online', 1, '2025-02-01');

-- ----- Lead sources -----
DECLARE @srcWeb   UNIQUEIDENTIFIER = NEWID();
DECLARE @srcHouzz UNIQUEIDENTIFIER = NEWID();
DECLARE @srcRef   UNIQUEIDENTIFIER = NEWID();
DECLARE @srcShow  UNIQUEIDENTIFIER = NEWID();

INSERT INTO LeadSource (id, name, channel, createdAt) VALUES
(@srcWeb,   'Google Ads',             'ad',       '2025-01-01'),
(@srcHouzz, 'Houzz',                  'web',      '2025-01-01'),
(@srcRef,   'Referral - Past Client', 'referral', '2025-01-01'),
(@srcShow,  'Showroom Walk-in',       'showroom', '2025-01-01');

-- ----- Leads -----
DECLARE @l1 UNIQUEIDENTIFIER = NEWID();  -- won
DECLARE @l2 UNIQUEIDENTIFIER = NEWID();  -- quote (open)
DECLARE @l3 UNIQUEIDENTIFIER = NEWID();  -- lost
DECLARE @l4 UNIQUEIDENTIFIER = NEWID();  -- won
DECLARE @l5 UNIQUEIDENTIFIER = NEWID();  -- consult (open)
DECLARE @l6 UNIQUEIDENTIFIER = NEWID();  -- new (open)
DECLARE @l7 UNIQUEIDENTIFIER = NEWID();  -- won
DECLARE @l8 UNIQUEIDENTIFIER = NEWID();  -- lost

INSERT INTO Lead (id, customerName, customerEmail, customerPhone, projectType, estimatedValue, stage, createdAt, updatedAt, rep_id, leadSource_id) VALUES
(@l1,'Anderson Family','anderson@example.com','512-555-0101','Walk-in closet',12500,'won',    '2025-02-03','2025-02-20',@repA,@srcRef),
(@l2,'B. Nguyen',      'bnguyen@example.com', '310-555-0144','Garage',         8200,'quote',  '2025-02-10','2025-02-18',@repB,@srcHouzz),
(@l3,'C. Patel',       'cpatel@example.com',  '512-555-0177','Pantry',         3100,'lost',   '2025-02-12','2025-02-25',@repA,@srcWeb),
(@l4,'Dawson LLC',     'ops@dawson.example',  '310-555-0188','Walk-in closet',15800,'won',    '2025-02-15','2025-03-05',@repB,@srcShow),
(@l5,'E. Romano',      'eromano@example.com', '512-555-0190','Home office',    6400,'consult','2025-03-01','2025-03-08',@repC,@srcHouzz),
(@l6,'F. Khan',        'fkhan@example.com',   '469-555-0123','Garage',         7000,'new',    '2025-03-10','2025-03-10',@repC,@srcWeb),
(@l7,'Gupta Home',     'gupta@example.com',   '512-555-0166','Walk-in closet',13900,'won',    '2025-03-04','2025-03-22',@repA,@srcRef),
(@l8,'H. Mueller',     'hm@example.com',      '310-555-0155','Pantry',         2900,'lost',   '2025-03-06','2025-03-15',@repB,@srcWeb);

-- ----- Stage events (funnel history; enteredAt drives time-in-stage) -----
INSERT INTO StageEvent (id, lead_id, stage, enteredAt, note) VALUES
(NEWID(),@l1,'new',    '2025-02-03',NULL),
(NEWID(),@l1,'consult','2025-02-06',NULL),
(NEWID(),@l1,'quote',  '2025-02-12',NULL),
(NEWID(),@l1,'won',    '2025-02-20',NULL),
(NEWID(),@l2,'new',    '2025-02-10',NULL),
(NEWID(),@l2,'consult','2025-02-14',NULL),
(NEWID(),@l2,'quote',  '2025-02-18',NULL),
(NEWID(),@l3,'new',    '2025-02-12',NULL),
(NEWID(),@l3,'consult','2025-02-16',NULL),
(NEWID(),@l3,'lost',   '2025-02-25','Chose competitor'),
(NEWID(),@l4,'new',    '2025-02-15',NULL),
(NEWID(),@l4,'consult','2025-02-19',NULL),
(NEWID(),@l4,'quote',  '2025-02-26',NULL),
(NEWID(),@l4,'won',    '2025-03-05',NULL),
(NEWID(),@l5,'new',    '2025-03-01',NULL),
(NEWID(),@l5,'consult','2025-03-08',NULL),
(NEWID(),@l6,'new',    '2025-03-10',NULL),
(NEWID(),@l7,'new',    '2025-03-04',NULL),
(NEWID(),@l7,'consult','2025-03-09',NULL),
(NEWID(),@l7,'quote',  '2025-03-15',NULL),
(NEWID(),@l7,'won',    '2025-03-22',NULL),
(NEWID(),@l8,'new',    '2025-03-06',NULL),
(NEWID(),@l8,'consult','2025-03-10',NULL),
(NEWID(),@l8,'lost',   '2025-03-15','No response');

-- ----- Quotes -----
INSERT INTO Quote (id, lead_id, amount, status, issuedAt, respondedAt) VALUES
(NEWID(),@l1,12500,'accepted','2025-02-12','2025-02-20'),
(NEWID(),@l2, 8200,'sent',    '2025-02-18',NULL),
(NEWID(),@l4,15800,'accepted','2025-02-26','2025-03-05'),
(NEWID(),@l7,13900,'accepted','2025-03-15','2025-03-22');
