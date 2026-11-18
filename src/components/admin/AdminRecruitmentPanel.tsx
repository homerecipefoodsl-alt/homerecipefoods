import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Award,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Lock,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useStore } from '../../context/StoreContext';
import { OperationType, db, handleFirestoreError, requireDb } from '../../lib/firebase';
import {
  APPLICATION_STATUS_META,
  APPLICATION_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_CATEGORY_PRESETS,
  SALARY_TYPE_OPTIONS,
  computeMobileVerificationHash,
  formatRecruitmentDateBn,
  getJobWindowLabelBn,
  getJobWindowState,
  getLocalTodayIso,
  toJobSlug,
} from '../../lib/recruitment';
import { toBengaliDigits } from '../../lib/utils';
import type {
  JobApplication,
  JobApplicationDocumentRef,
  JobApplicationStatus,
  JobCircularStatus,
  JobExamTemplate,
  JobInterviewStatus,
  JobPosting,
} from '../../types';

type RecruitmentSubTab =
  | 'overview'
  | 'circulars'
  | 'applications'
  | 'shortlisted'
  | 'exams'
  | 'interviews'
  | 'selected'
  | 'rejected';

const PAGE_SIZE = 15;

interface JobFormState {
  id?: string;
  slug: string;
  title: string;
  titleEn: string;
  department: string;
  category: string;
  customCategory: string;
  vacancies: number;
  salary: string;
  salaryType: string;
  workplace: string;
  employmentType: string;
  workingHours: string;
  description: string;
  responsibilitiesText: string;
  requirementsText: string;
  educationRequirement: string;
  experienceRequirement: string;
  benefitsText: string;
  startDate: string;
  deadline: string;
  status: JobCircularStatus;
  contactInfo: string;
  instructions: string;
}

interface ExamTemplateFormState {
  title: string;
  jobId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  duration: string;
  location: string;
  examType: string;
  instructions: string;
  totalMarks: number;
  passMarks: number;
}

function createEmptyJobForm(): JobFormState {
  const today = getLocalTodayIso();
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 20);
  const y = nextMonth.getFullYear();
  const m = String(nextMonth.getMonth() + 1).padStart(2, '0');
  const d = String(nextMonth.getDate()).padStart(2, '0');

  return {
    slug: '',
    title: '',
    titleEn: '',
    department: '',
    category: JOB_CATEGORY_PRESETS[0],
    customCategory: '',
    vacancies: 1,
    salary: 'আলোচনা সাপেক্ষে',
    salaryType: 'Negotiable',
    workplace: 'বগুড়া প্রধান কার্যালয় / শোরুম',
    employmentType: 'Full-time',
    workingHours: 'সকাল ৯:০০ – সন্ধ্যা ৬:০০',
    description: '',
    responsibilitiesText: '',
    requirementsText: '',
    educationRequirement: '',
    experienceRequirement: '',
    benefitsText: '',
    startDate: today,
    deadline: `${y}-${m}-${d}`,
    status: 'Draft',
    contactInfo: '',
    instructions: '',
  };
}

function createEmptyExamTemplateForm(defaultJobId = ''): ExamTemplateFormState {
  return {
    title: '',
    jobId: defaultJobId,
    examDate: getLocalTodayIso(),
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    duration: '৯০ মিনিট',
    location: 'বগুড়া প্রধান কার্যালয়',
    examType: 'Written + Viva',
    instructions: 'মূল এনআইডি কার্ড, ছবি এবং কলম সাথে নিয়ে নির্ধারিত সময়ের ২০ মিনিট পূর্বে উপস্থিত থাকবেন।',
    totalMarks: 100,
    passMarks: 50,
  };
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function getApplicantDateIso(app: JobApplication): string {
  const ts = app.createdAt as { toDate?: () => Date } | undefined;
  if (ts && typeof ts.toDate === 'function') {
    const dt = ts.toDate();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const firstHistory = app.statusHistory?.[0]?.changedAt;
  if (firstHistory && /^\d{4}-\d{2}-\d{2}/.test(firstHistory)) {
    return firstHistory.slice(0, 10);
  }
  return '';
}

export function AdminRecruitmentPanel() {
  const { user, isSuperAdmin, logAdminActivity } = useStore();
  const [subTab, setSubTab] = useState<RecruitmentSubTab>('overview');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [exams, setExams] = useState<JobExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Job circular modal/editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [jobForm, setJobForm] = useState<JobFormState>(createEmptyJobForm);
  const [savingJob, setSavingJob] = useState(false);
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);

  // Exam creation form state (/jobExams)
  const [examForm, setExamForm] = useState<ExamTemplateFormState>(() =>
    createEmptyExamTemplateForm()
  );
  const [savingExamTemplate, setSavingExamTemplate] = useState(false);

  // Applications filter, pagination & detail state
  const [appSearch, setAppSearch] = useState('');
  const [appJobFilter, setAppJobFilter] = useState('all');
  const [appStatusFilter, setAppStatusFilter] = useState('all');
  const [appDateFilter, setAppDateFilter] = useState('');
  const [showArchivedApps, setShowArchivedApps] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [nextStatus, setNextStatus] = useState<JobApplicationStatus>('Submitted');
  const [adminNotes, setAdminNotes] = useState('');

  // Candidate Exam assignment fields
  const [selectedExamTemplateId, setSelectedExamTemplateId] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examStartTime, setExamStartTime] = useState('');
  const [examEndTime, setExamEndTime] = useState('');
  const [examDuration, setExamDuration] = useState('');
  const [examTime, setExamTime] = useState('');
  const [examLocation, setExamLocation] = useState('');
  const [examType, setExamType] = useState('Written + Viva');
  const [examTotalMarks, setExamTotalMarks] = useState<number>(100);
  const [examPassMarks, setExamPassMarks] = useState<number>(50);
  const [examInstructions, setExamInstructions] = useState('');

  // Candidate Interview fields
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [interviewType, setInterviewType] = useState('In-person / মুখোমুখি');
  const [interviewStatus, setInterviewStatus] = useState<JobInterviewStatus>('scheduled');
  const [interviewNotes, setInterviewNotes] = useState('');

  const [savingApp, setSavingApp] = useState(false);
  const [confirmDeleteAppId, setConfirmDeleteAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const activeDb = db;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(activeDb, 'jobPostings'), orderBy('updatedAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as JobPosting);
          setJobs(list);
          setExamForm((prev) =>
            !prev.jobId && list.length > 0 ? { ...prev, jobId: list[0].id } : prev
          );
          setLoading(false);
        },
        (err) => {
          setLoading(false);
          try {
            handleFirestoreError(err, OperationType.LIST, 'jobPostings');
          } catch {
            // Logged structurally
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(activeDb, 'jobApplications'), orderBy('createdAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as JobApplication);
          setApplications(list);
          setSelectedApp((prev) =>
            prev ? list.find((a) => a.id === prev.id) || null : null
          );
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'jobApplications');
          } catch {
            // Logged structurally
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(activeDb, 'jobExams'), orderBy('createdAt', 'desc')),
        (snap) => {
          setExams(snap.docs.map((d) => d.data() as JobExamTemplate));
        },
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, 'jobExams');
          } catch {
            // Logged structurally
          }
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  const visibleJobs = useMemo(() => jobs.filter((j) => !j.deleted), [jobs]);
  const visibleApplications = useMemo(
    () => applications.filter((a) => !a.deleted),
    [applications]
  );

  // KPI calculations (live from Firestore)
  const kpis = useMemo(() => {
    const activeJobs = visibleJobs.filter((j) => getJobWindowState(j) === 'open').length;
    const totalApps = visibleApplications.length;
    const newApps = visibleApplications.filter((a) => a.status === 'Submitted').length;
    const shortlisted = visibleApplications.filter(
      (a) => a.status === 'Shortlisted' || a.shortlisted
    ).length;
    const examCandidates = visibleApplications.filter(
      (a) =>
        a.status === 'Exam Scheduled' ||
        a.status === 'Exam Completed' ||
        Boolean(a.exam?.examDate)
    ).length;
    const interviewCandidates = visibleApplications.filter(
      (a) => a.status === 'Interview' || Boolean(a.interview?.interviewDate)
    ).length;
    const selected = visibleApplications.filter((a) => a.status === 'Selected').length;
    const rejected = visibleApplications.filter((a) => a.status === 'Rejected').length;
    return {
      activeJobs,
      totalApps,
      newApps,
      shortlisted,
      examCandidates,
      interviewCandidates,
      selected,
      rejected,
    };
  }, [visibleJobs, visibleApplications]);

  const stageApplications = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return visibleApplications.filter((app) => {
      if (subTab === 'shortlisted') {
        if (app.status !== 'Shortlisted' && !app.shortlisted) return false;
      } else if (subTab === 'exams') {
        if (
          app.status !== 'Exam Scheduled' &&
          app.status !== 'Exam Completed' &&
          app.status !== 'Shortlisted' &&
          !app.exam?.examDate
        ) {
          return false;
        }
      } else if (subTab === 'interviews') {
        if (app.status !== 'Interview' && !app.interview?.interviewDate) return false;
      } else if (subTab === 'selected') {
        if (app.status !== 'Selected') return false;
      } else if (subTab === 'rejected') {
        if (app.status !== 'Rejected') return false;
      }

      if (!showArchivedApps && app.archived) return false;
      if (showArchivedApps && !app.archived) return false;
      if (appJobFilter !== 'all' && app.jobId !== appJobFilter) return false;
      if (appStatusFilter !== 'all' && app.status !== appStatusFilter) return false;
      if (appDateFilter && getApplicantDateIso(app) !== appDateFilter) return false;

      if (q) {
        const hay = `${app.applicationCode} ${app.fullName} ${app.mobile} ${
          app.email || ''
        } ${app.jobTitle} ${app.nidNumber || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    visibleApplications,
    subTab,
    showArchivedApps,
    appJobFilter,
    appStatusFilter,
    appDateFilter,
    appSearch,
  ]);

  const totalPages = Math.max(1, Math.ceil(stageApplications.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedApplications = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return stageApplications.slice(start, start + PAGE_SIZE);
  }, [stageApplications, safePage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [subTab, appSearch, appJobFilter, appStatusFilter, appDateFilter, showArchivedApps]);

  const openCreateJobModal = () => {
    setErrorMsg(null);
    setBannerMsg(null);
    setJobForm(createEmptyJobForm());
    setEditorOpen(true);
  };

  const openEditJobModal = (job: JobPosting) => {
    setErrorMsg(null);
    setBannerMsg(null);
    const isPreset = (JOB_CATEGORY_PRESETS as readonly string[]).includes(job.category);
    setJobForm({
      id: job.id,
      slug: job.slug,
      title: job.title,
      titleEn: job.titleEn || '',
      department: job.department || '',
      category: isPreset ? job.category : 'CUSTOM',
      customCategory: isPreset ? '' : job.category,
      vacancies: job.vacancies || 1,
      salary: job.salary || '',
      salaryType: job.salaryType || 'Negotiable',
      workplace: job.workplace || '',
      employmentType: job.employmentType || 'Full-time',
      workingHours: job.workingHours || '',
      description: job.description || '',
      responsibilitiesText: (job.responsibilities || []).join('\n'),
      requirementsText: (job.requirements || []).join('\n'),
      educationRequirement: job.educationRequirement || '',
      experienceRequirement: job.experienceRequirement || '',
      benefitsText: (job.benefits || []).join('\n'),
      startDate: job.startDate || getLocalTodayIso(),
      deadline: job.deadline || getLocalTodayIso(),
      status: job.status || 'Draft',
      contactInfo: job.contactInfo || '',
      instructions: job.instructions || '',
    });
    setEditorOpen(true);
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBannerMsg(null);

    const resolvedCategory =
      jobForm.category === 'CUSTOM'
        ? jobForm.customCategory.trim()
        : jobForm.category.trim();

    if (jobForm.title.trim().length < 2) {
      setErrorMsg('পদের নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
      return;
    }
    if (!resolvedCategory) {
      setErrorMsg('চাকরির ক্যাটাগরি নির্বাচন বা লিখুন।');
      return;
    }
    if (jobForm.description.trim().length < 5) {
      setErrorMsg('কাজের বিবরণ কমপক্ষে ৫ অক্ষরের হতে হবে।');
      return;
    }
    if (jobForm.deadline < jobForm.startDate) {
      setErrorMsg('আবেদনের শেষ তারিখ শুরুর তারিখের আগে হতে পারবে না।');
      return;
    }

    setSavingJob(true);
    try {
      const firestore = requireDb();
      const isEdit = Boolean(jobForm.id);
      const id =
        jobForm.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const slug =
        (jobForm.slug && /^[a-z0-9-]+$/.test(jobForm.slug.trim())
          ? jobForm.slug.trim()
          : '') || toJobSlug(jobForm.titleEn || jobForm.title, resolvedCategory);

      const responsibilities = splitLines(jobForm.responsibilitiesText);
      const requirements = splitLines(jobForm.requirementsText);
      const benefits = splitLines(jobForm.benefitsText);

      const payload: Record<string, unknown> = {
        id,
        slug,
        title: jobForm.title.trim().slice(0, 160),
        titleEn: jobForm.titleEn.trim().slice(0, 160),
        department: jobForm.department.trim().slice(0, 100),
        category: resolvedCategory.slice(0, 100),
        vacancies: Math.max(1, Math.min(1000, Math.round(Number(jobForm.vacancies) || 1))),
        salary: (jobForm.salary.trim() || 'আলোচনা সাপেক্ষে').slice(0, 120),
        salaryType: jobForm.salaryType.slice(0, 60),
        workplace: jobForm.workplace.trim().slice(0, 160),
        employmentType: jobForm.employmentType.slice(0, 80),
        workingHours: jobForm.workingHours.trim().slice(0, 120),
        description: jobForm.description.trim().slice(0, 4000),
        responsibilities:
          responsibilities.length > 0 ? responsibilities : ['সংশ্লিষ্ট বিভাগের দায়িত্ব পালন'],
        requirements:
          requirements.length > 0
            ? requirements
            : ['সততা, দায়িত্বশীলতা ও পরিশ্রমী মানসিকতা'],
        educationRequirement: jobForm.educationRequirement.trim().slice(0, 300),
        experienceRequirement: jobForm.experienceRequirement.trim().slice(0, 300),
        benefits,
        startDate: jobForm.startDate,
        deadline: jobForm.deadline,
        status: jobForm.status,
        contactInfo: jobForm.contactInfo.trim().slice(0, 300),
        instructions: jobForm.instructions.trim().slice(0, 1000),
        deleted: false,
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        const existingJob = jobs.find((j) => j.id === id);
        await setDoc(doc(firestore, 'jobPostings', id), {
          ...payload,
          createdBy: existingJob?.createdBy || user?.email || '',
          createdAt: existingJob?.createdAt || serverTimestamp(),
        });
        await logAdminActivity(
          'update',
          'jobPostings',
          id,
          String(payload.title),
          `Status=${jobForm.status}`
        );
        setBannerMsg('নিয়োগ বিজ্ঞপ্তি সফলভাবে আপডেট হয়েছে।');
      } else {
        await setDoc(doc(firestore, 'jobPostings', id), {
          ...payload,
          createdBy: user?.email || '',
          createdAt: serverTimestamp(),
        });
        await logAdminActivity(
          'create',
          'jobPostings',
          id,
          String(payload.title),
          `Status=${jobForm.status}`
        );
        setBannerMsg('নতুন নিয়োগ বিজ্ঞপ্তি তৈরি হয়েছে।');
      }

      setEditorOpen(false);
    } catch (err) {
      setErrorMsg('নিয়োগ বিজ্ঞপ্তি সেভ করতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.WRITE, 'jobPostings');
      } catch {
        // Logged structurally
      }
    } finally {
      setSavingJob(false);
    }
  };

  const changeJobStatus = async (job: JobPosting, status: JobCircularStatus) => {
    try {
      const firestore = requireDb();
      await updateDoc(doc(firestore, 'jobPostings', job.id), {
        status,
        updatedAt: serverTimestamp(),
      });
      await logAdminActivity(
        'update_status',
        'jobPostings',
        job.id,
        job.title,
        `Status=${status}`
      );
      setBannerMsg(`"${job.title}" বিজ্ঞপ্তির অবস্থা "${status}" করা হয়েছে।`);
    } catch (err) {
      setErrorMsg('স্ট্যাটাস পরিবর্তন করা যায়নি।');
      try {
        handleFirestoreError(err, OperationType.UPDATE, `jobPostings/${job.id}`);
      } catch {
        // Logged
      }
    }
  };

  const archiveOrDeleteJob = async (job: JobPosting, hardDelete: boolean) => {
    try {
      const firestore = requireDb();
      if (hardDelete && isSuperAdmin) {
        await deleteDoc(doc(firestore, 'jobPostings', job.id));
        await logAdminActivity('delete', 'jobPostings', job.id, job.title);
        setBannerMsg(`"${job.title}" স্থায়ীভাবে ডিলিট করা হয়েছে।`);
      } else {
        await updateDoc(doc(firestore, 'jobPostings', job.id), {
          deleted: true,
          status: 'Closed',
          updatedAt: serverTimestamp(),
        });
        await logAdminActivity('archive', 'jobPostings', job.id, job.title);
        setBannerMsg(`"${job.title}" আর্কাইভ করা হয়েছে।`);
      }
      setConfirmDeleteJobId(null);
    } catch (err) {
      setErrorMsg('বিজ্ঞপ্তি মুছতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.DELETE, `jobPostings/${job.id}`);
      } catch {
        // Logged
      }
    }
  };

  const handleCreateExamTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBannerMsg(null);

    const targetJob = visibleJobs.find((j) => j.id === examForm.jobId);
    if (!targetJob) {
      setErrorMsg('পরীক্ষার জন্য সংশ্লিষ্ট নিয়োগ বিজ্ঞপ্তি নির্বাচন করুন।');
      return;
    }
    if (examForm.title.trim().length < 2) {
      setErrorMsg('পরীক্ষার শিরোনাম (Exam Title) কমপক্ষে ২ অক্ষরের হতে হবে।');
      return;
    }
    if (!examForm.examDate || !examForm.startTime.trim() || !examForm.endTime.trim()) {
      setErrorMsg('পরীক্ষার তারিখ, শুরুর সময় ও শেষের সময় অবশ্যই দিন।');
      return;
    }

    setSavingExamTemplate(true);
    try {
      const firestore = requireDb();
      const examId = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const totalMarks = Math.max(1, Math.min(10000, Math.round(Number(examForm.totalMarks) || 100)));
      const passMarks = Math.max(0, Math.min(totalMarks, Math.round(Number(examForm.passMarks) || 0)));

      await setDoc(doc(firestore, 'jobExams', examId), {
        id: examId,
        title: examForm.title.trim().slice(0, 160),
        jobId: targetJob.id,
        jobTitle: targetJob.title.slice(0, 160),
        examDate: examForm.examDate,
        startTime: examForm.startTime.trim().slice(0, 40),
        endTime: examForm.endTime.trim().slice(0, 40),
        duration: (examForm.duration.trim() || '৬০ মিনিট').slice(0, 60),
        location: (examForm.location.trim() || targetJob.workplace).slice(0, 200),
        examType: (examForm.examType.trim() || 'Written + Viva').slice(0, 80),
        instructions: examForm.instructions.trim().slice(0, 1000),
        totalMarks,
        passMarks,
        createdBy: user?.email || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logAdminActivity(
        'create',
        'jobExams',
        examId,
        examForm.title.trim(),
        `Job=${targetJob.title}`
      );
      setBannerMsg(`"${examForm.title.trim()}" পরীক্ষা টেমপ্লেট তৈরি হয়েছে। এখন প্রার্থীদের সাথে যুক্ত করতে পারেন।`);
      setExamForm(createEmptyExamTemplateForm(targetJob.id));
    } catch (err) {
      setErrorMsg('পরীক্ষা তৈরি করতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.CREATE, 'jobExams');
      } catch {
        // Logged
      }
    } finally {
      setSavingExamTemplate(false);
    }
  };

  const applyExamTemplateToCandidateForm = (templateId: string) => {
    setSelectedExamTemplateId(templateId);
    const tpl = exams.find((x) => x.id === templateId);
    if (!tpl) return;
    setExamTitle(tpl.title);
    setExamDate(tpl.examDate);
    setExamStartTime(tpl.startTime);
    setExamEndTime(tpl.endTime);
    setExamDuration(tpl.duration);
    setExamTime(`${tpl.startTime} – ${tpl.endTime}`);
    setExamLocation(tpl.location);
    setExamType(tpl.examType);
    setExamTotalMarks(tpl.totalMarks);
    setExamPassMarks(tpl.passMarks);
    setExamInstructions(tpl.instructions);
  };

  const openApplicationDetail = (app: JobApplication) => {
    setSelectedApp(app);
    setNextStatus(app.status);
    setAdminNotes(app.adminNotes || app.notes || '');
    setSelectedExamTemplateId(app.exam?.examId || '');
    setExamTitle(app.exam?.examTitle || '');
    setExamDate(app.exam?.examDate || '');
    setExamStartTime(app.exam?.startTime || '');
    setExamEndTime(app.exam?.endTime || '');
    setExamDuration(app.exam?.duration || '');
    setExamTime(app.exam?.examTime || '');
    setExamLocation(app.exam?.examLocation || '');
    setExamType(app.exam?.examType || 'Written + Viva');
    setExamTotalMarks(app.exam?.totalMarks ?? 100);
    setExamPassMarks(app.exam?.passMarks ?? 50);
    setExamInstructions(app.exam?.examInstructions || '');
    setInterviewDate(app.interview?.interviewDate || '');
    setInterviewTime(app.interview?.interviewTime || '');
    setInterviewLocation(app.interview?.interviewLocation || '');
    setInterviewType(app.interview?.interviewType || 'In-person / মুখোমুখি');
    setInterviewStatus(app.interview?.interviewStatus || 'scheduled');
    setInterviewNotes(app.interview?.interviewNotes || '');
    setConfirmDeleteAppId(null);
    setErrorMsg(null);
  };

  const persistApplicationUpdate = async (params: {
    app: JobApplication;
    status: JobApplicationStatus;
    notes: string;
    shortlisted?: boolean;
    examPayload?: JobApplication['exam'];
    interviewPayload?: JobApplication['interview'];
    historyNote: string;
    archived?: boolean;
  }) => {
    setSavingApp(true);
    setErrorMsg(null);
    setBannerMsg(null);

    try {
      const firestore = requireDb();
      const nowIso = new Date().toISOString();
      const reviewerEmail = user?.email || '';
      const nextHistory = [
        ...(params.app.statusHistory || []),
        {
          status: params.status,
          note: params.historyNote,
          changedAt: nowIso,
          changedBy: reviewerEmail,
        },
      ].slice(-25);

      const cleanNotes = params.notes.trim().slice(0, 2000);
      const appUpdates: Record<string, unknown> = {
        status: params.status,
        shortlisted:
          params.shortlisted !== undefined
            ? params.shortlisted
            : params.status === 'Shortlisted' || Boolean(params.app.shortlisted),
        adminNotes: cleanNotes,
        notes: cleanNotes,
        reviewedBy: reviewerEmail.slice(0, 254),
        reviewedAt: nowIso,
        statusHistory: nextHistory,
        updatedAt: serverTimestamp(),
      };

      if (params.examPayload !== undefined) {
        appUpdates.exam = params.examPayload;
      }
      if (params.interviewPayload !== undefined) {
        appUpdates.interview = params.interviewPayload;
      }
      if (params.archived !== undefined) {
        appUpdates.archived = params.archived;
      }

      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'jobApplications', params.app.id), appUpdates);

      // Keep Zero-PII status tracker synchronized with mobileHash preserved
      const mobileHash = await computeMobileVerificationHash(params.app.mobile);
      const activeExam =
        params.examPayload !== undefined ? params.examPayload : params.app.exam;
      const activeInterview =
        params.interviewPayload !== undefined
          ? params.interviewPayload
          : params.app.interview;

      batch.set(doc(firestore, 'jobApplicationStatuses', params.app.applicationCode), {
        id: params.app.applicationCode,
        jobId: params.app.jobId,
        jobTitle: params.app.jobTitle,
        jobCategory: params.app.jobCategory,
        mobileHash,
        status: params.status,
        submittedDateText: params.app.submittedDateText,
        ...(activeExam?.examDate
          ? {
              ...(activeExam.examTitle ? { examTitle: activeExam.examTitle } : {}),
              examDate: activeExam.examDate,
              ...(activeExam.startTime ? { examStartTime: activeExam.startTime } : {}),
              ...(activeExam.endTime ? { examEndTime: activeExam.endTime } : {}),
              ...(activeExam.duration ? { examDuration: activeExam.duration } : {}),
              examTime: activeExam.examTime || '',
              examLocation: activeExam.examLocation || '',
              examType: activeExam.examType || '',
              examInstructions: activeExam.examInstructions || '',
              ...(typeof activeExam.totalMarks === 'number'
                ? { examTotalMarks: Math.round(activeExam.totalMarks) }
                : {}),
              ...(typeof activeExam.passMarks === 'number'
                ? { examPassMarks: Math.round(activeExam.passMarks) }
                : {}),
            }
          : {}),
        ...(activeInterview?.interviewDate
          ? {
              interviewDate: activeInterview.interviewDate,
              interviewTime: activeInterview.interviewTime || '',
              interviewLocation: activeInterview.interviewLocation || '',
              ...(activeInterview.interviewType
                ? { interviewType: activeInterview.interviewType }
                : {}),
              ...(activeInterview.interviewStatus
                ? { interviewStatus: activeInterview.interviewStatus }
                : {}),
              interviewNotes: activeInterview.interviewNotes || '',
            }
          : {}),
        createdAt: params.app.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      await logAdminActivity(
        'update_application',
        'jobApplications',
        params.app.id,
        `${params.app.applicationCode} (${params.app.fullName})`,
        `Status=${params.status}`
      );
      setBannerMsg(`${params.app.applicationCode} — ${params.historyNote}`);
    } catch (err) {
      setErrorMsg('আবেদন আপডেট করতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.UPDATE, `jobApplications/${params.app.id}`);
      } catch {
        // Logged
      }
    } finally {
      setSavingApp(false);
    }
  };

  const handleQuickAction = async (
    targetStatus: JobApplicationStatus,
    historyNote: string,
    shortlisted?: boolean
  ) => {
    if (!selectedApp) return;
    setNextStatus(targetStatus);
    await persistApplicationUpdate({
      app: selectedApp,
      status: targetStatus,
      shortlisted,
      notes: adminNotes,
      historyNote,
    });
  };

  const handleSaveStatusAndNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    await persistApplicationUpdate({
      app: selectedApp,
      status: nextStatus,
      notes: adminNotes,
      historyNote: `স্ট্যাটাস পরিবর্তন: ${APPLICATION_STATUS_META[nextStatus].labelBn}`,
    });
  };

  const handleScheduleExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    const resolvedTime =
      examTime.trim() ||
      (examStartTime.trim() && examEndTime.trim()
        ? `${examStartTime.trim()} – ${examEndTime.trim()}`
        : examStartTime.trim());

    if (!examDate.trim() || !resolvedTime || !examLocation.trim()) {
      setErrorMsg('পরীক্ষার তারিখ, সময় ও স্থান অবশ্যই দিতে হবে।');
      return;
    }

    const totalMarks = Math.max(0, Math.round(Number(examTotalMarks) || 0));
    const passMarks = Math.max(0, Math.min(totalMarks || 10000, Math.round(Number(examPassMarks) || 0)));

    const examPayload: NonNullable<JobApplication['exam']> = {
      ...(selectedExamTemplateId ? { examId: selectedExamTemplateId } : {}),
      ...(examTitle.trim() ? { examTitle: examTitle.trim() } : {}),
      examDate: examDate.trim(),
      ...(examStartTime.trim() ? { startTime: examStartTime.trim() } : {}),
      ...(examEndTime.trim() ? { endTime: examEndTime.trim() } : {}),
      ...(examDuration.trim() ? { duration: examDuration.trim() } : {}),
      examTime: resolvedTime,
      examLocation: examLocation.trim(),
      examType: examType.trim() || 'Written + Viva',
      examInstructions: examInstructions.trim(),
      totalMarks,
      passMarks,
      scheduledBy: user?.email || '',
      scheduledAt: new Date().toISOString(),
    };
    setNextStatus('Exam Scheduled');
    await persistApplicationUpdate({
      app: selectedApp,
      status: 'Exam Scheduled',
      shortlisted: true,
      examPayload,
      notes: adminNotes,
      historyNote: `পরীক্ষার সময় নির্ধারিত: ${examDate} (${resolvedTime})`,
    });
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    if (!interviewDate.trim() || !interviewTime.trim() || !interviewLocation.trim()) {
      setErrorMsg('ইন্টারভিউয়ের তারিখ, সময় ও স্থান অবশ্যই দিতে হবে।');
      return;
    }
    const interviewPayload: NonNullable<JobApplication['interview']> = {
      interviewDate: interviewDate.trim(),
      interviewTime: interviewTime.trim(),
      interviewLocation: interviewLocation.trim(),
      interviewType: interviewType.trim() || 'In-person',
      interviewStatus,
      interviewNotes: interviewNotes.trim(),
      scheduledBy: user?.email || '',
      scheduledAt: new Date().toISOString(),
    };
    setNextStatus('Interview');
    await persistApplicationUpdate({
      app: selectedApp,
      status: 'Interview',
      shortlisted: true,
      interviewPayload,
      notes: adminNotes,
      historyNote: `ইন্টারভিউ নির্ধারিত: ${interviewDate} (${interviewTime})`,
    });
  };

  const handleDeleteApplicationPermanent = async (app: JobApplication) => {
    if (!isSuperAdmin) return;
    setSavingApp(true);
    try {
      const firestore = requireDb();
      await deleteDoc(doc(firestore, 'jobApplications', app.id));
      await logAdminActivity(
        'delete',
        'jobApplications',
        app.id,
        app.applicationCode,
        app.fullName
      );
      setSelectedApp(null);
      setConfirmDeleteAppId(null);
      setBannerMsg(`${app.applicationCode} স্থায়ীভাবে ডিলিট করা হয়েছে।`);
    } catch (err) {
      setErrorMsg('আবেদন ডিলিট করতে সমস্যা হয়েছে।');
      try {
        handleFirestoreError(err, OperationType.DELETE, `jobApplications/${app.id}`);
      } catch {
        // Logged
      }
    } finally {
      setSavingApp(false);
    }
  };

  const applicantDocList = (app: JobApplication): JobApplicationDocumentRef[] => {
    const refs: JobApplicationDocumentRef[] = [];
    if (app.documentUrls?.nidOrBirthCert) refs.push(app.documentUrls.nidOrBirthCert);
    if (app.documentUrls?.cv) refs.push(app.documentUrls.cv);
    if (app.documentUrls?.educationalCert) refs.push(app.documentUrls.educationalCert);
    if (app.documentUrls?.otherDoc) refs.push(app.documentUrls.otherDoc);
    return refs;
  };

  const isCandidateListTab =
    subTab === 'applications' ||
    subTab === 'shortlisted' ||
    subTab === 'exams' ||
    subTab === 'interviews' ||
    subTab === 'selected' ||
    subTab === 'rejected';

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1C1917]">
            Recruitment · নিয়োগ ও চাকরির আবেদন ব্যবস্থাপনা
          </h2>
          <p className="mt-0.5 text-xs text-[#57534E]">
            নিয়োগ বিজ্ঞপ্তি প্রকাশ, আবেদন পর্যালোচনা, সংক্ষিপ্ত তালিকা, পরীক্ষা/ইন্টারভিউ পরিচালনা ও চূড়ান্ত নিয়োগ নিয়ন্ত্রণ করুন।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openCreateJobModal}
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B91C1C]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Job · নতুন নিয়োগ</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Menu Tabs */}
      <div className="flex flex-wrap gap-2">
        <SubTabButton
          active={subTab === 'overview'}
          onClick={() => setSubTab('overview')}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          label="Dashboard"
        />
        <SubTabButton
          active={subTab === 'circulars'}
          onClick={() => setSubTab('circulars')}
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          label={`Job Postings (${visibleJobs.length})`}
        />
        <SubTabButton
          active={subTab === 'applications'}
          onClick={() => setSubTab('applications')}
          icon={<Users className="h-3.5 w-3.5" />}
          label={`Applications (${visibleApplications.length})`}
        />
        <SubTabButton
          active={subTab === 'shortlisted'}
          onClick={() => setSubTab('shortlisted')}
          icon={<UserCheck className="h-3.5 w-3.5" />}
          label={`Shortlisted (${kpis.shortlisted})`}
        />
        <SubTabButton
          active={subTab === 'exams'}
          onClick={() => setSubTab('exams')}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label={`Exam Candidates (${kpis.examCandidates})`}
        />
        <SubTabButton
          active={subTab === 'interviews'}
          onClick={() => setSubTab('interviews')}
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          label={`Interview (${kpis.interviewCandidates})`}
        />
        <SubTabButton
          active={subTab === 'selected'}
          onClick={() => setSubTab('selected')}
          icon={<Award className="h-3.5 w-3.5" />}
          label={`Selected (${kpis.selected})`}
        />
        <SubTabButton
          active={subTab === 'rejected'}
          onClick={() => setSubTab('rejected')}
          icon={<UserX className="h-3.5 w-3.5" />}
          label={`Rejected (${kpis.rejected})`}
        />
      </div>

      {bannerMsg && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          <span>{bannerMsg}</span>
          <button type="button" onClick={() => setBannerMsg(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* SUBTAB 1: OVERVIEW KPIs */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <KpiCard label="সক্রিয় বিজ্ঞপ্তি" value={kpis.activeJobs} accent="text-emerald-700" />
            <KpiCard label="মোট আবেদন" value={kpis.totalApps} accent="text-[#1C1917]" />
            <KpiCard label="নতুন আবেদন" value={kpis.newApps} accent="text-sky-700" />
            <KpiCard label="Shortlisted" value={kpis.shortlisted} accent="text-indigo-700" />
            <KpiCard label="Exam" value={kpis.examCandidates} accent="text-purple-700" />
            <KpiCard label="Interview" value={kpis.interviewCandidates} accent="text-amber-700" />
            <KpiCard label="Selected" value={kpis.selected} accent="text-emerald-700" />
            <KpiCard label="Rejected" value={kpis.rejected} accent="text-[#DC1F26]" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
              <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
                <h3 className="text-sm font-bold text-[#1C1917]">সাম্প্রতিক বিজ্ঞপ্তি</h3>
                <button
                  type="button"
                  onClick={() => setSubTab('circulars')}
                  className="cursor-pointer text-xs font-semibold text-[#DC1F26] hover:underline"
                >
                  সব দেখুন →
                </button>
              </div>
              {visibleJobs.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#78716C]">
                  এখনো কোনো নিয়োগ বিজ্ঞপ্তি তৈরি করা হয়নি।
                </p>
              ) : (
                <div className="divide-y divide-[#F5F4F0]">
                  {visibleJobs.slice(0, 5).map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between gap-3 py-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-[#1C1917]">{job.title}</p>
                        <p className="text-[11px] text-[#78716C]">
                          {job.department ? `${job.department} · ` : ''}
                          {job.category} · শেষ তারিখ: {formatRecruitmentDateBn(job.deadline)}
                        </p>
                      </div>
                      <span className="rounded border border-[#E7E5E4] bg-[#FAFAF8] px-2 py-1 text-[11px] font-semibold text-[#1C1917]">
                        {job.status} ({getJobWindowLabelBn(getJobWindowState(job))})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#E7E5E4] bg-white p-5">
              <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-3">
                <h3 className="text-sm font-bold text-[#1C1917]">সাম্প্রতিক আবেদনসমূহ</h3>
                <button
                  type="button"
                  onClick={() => setSubTab('applications')}
                  className="cursor-pointer text-xs font-semibold text-[#DC1F26] hover:underline"
                >
                  সব দেখুন →
                </button>
              </div>
              {visibleApplications.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#78716C]">
                  এখনো কোনো চাকরির আবেদন জমা পড়েনি।
                </p>
              ) : (
                <div className="divide-y divide-[#F5F4F0]">
                  {visibleApplications.slice(0, 5).map((app) => {
                    const st = APPLICATION_STATUS_META[app.status];
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          setSubTab('applications');
                          openApplicationDetail(app);
                        }}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left text-xs hover:bg-[#FAFAF8]"
                      >
                        <div>
                          <p className="font-bold text-[#1C1917]">
                            {app.fullName}{' '}
                            <span className="font-mono text-[11px] text-[#DC1F26]">
                              ({app.applicationCode})
                            </span>
                          </p>
                          <p className="text-[11px] text-[#78716C]">
                            {app.jobTitle} · {app.mobile}
                          </p>
                        </div>
                        <span
                          className={`rounded border px-2 py-0.5 text-[10px] font-bold ${st.badgeClass}`}
                        >
                          {st.labelEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: JOB CIRCULARS MANAGEMENT */}
      {subTab === 'circulars' && (
        <div className="space-y-4">
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl border border-[#E7E5E4] bg-white" />
          ) : visibleJobs.length === 0 ? (
            <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center">
              <p className="text-sm font-semibold text-[#1C1917]">
                কোনো নিয়োগ বিজ্ঞপ্তি পাওয়া যায়নি।
              </p>
              <button
                type="button"
                onClick={openCreateJobModal}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                <span>প্রথম নিয়োগ বিজ্ঞপ্তি তৈরি করুন</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {visibleJobs.map((job) => {
                const winState = getJobWindowState(job);
                const appCount = visibleApplications.filter(
                  (a) => a.jobId === job.id
                ).length;

                return (
                  <div
                    key={job.id}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-[#E7E5E4] bg-[#FAFAF8] px-2 py-0.5 text-[11px] font-bold text-[#1C1917]">
                          {job.department ? `${job.department} · ${job.category}` : job.category}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                            job.status === 'Published' && winState === 'open'
                              ? 'bg-emerald-50 text-emerald-800'
                              : job.status === 'Draft'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {job.status} · {getJobWindowLabelBn(winState)}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-[#DC1F26]">
                          {appCount} আবেদন
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-bold text-[#1C1917]">
                        {job.title}
                      </h3>
                      <p className="text-xs text-[#57534E]">
                        কর্মস্থল: {job.workplace} · শূন্যপদ: {toBengaliDigits(job.vacancies)} · সময়:{' '}
                        {job.startDate} → {job.deadline}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {job.status !== 'Published' && (
                        <button
                          type="button"
                          onClick={() => changeJobStatus(job, 'Published')}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Publish</span>
                        </button>
                      )}
                      {job.status === 'Published' && (
                        <button
                          type="button"
                          onClick={() => changeJobStatus(job, 'Hidden')}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D6D3D1] px-3 py-1.5 text-xs font-semibold text-[#44403C] hover:border-[#1C1917]"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                          <span>Hide</span>
                        </button>
                      )}
                      {job.status !== 'Closed' && (
                        <button
                          type="button"
                          onClick={() => changeJobStatus(job, 'Closed')}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D6D3D1] px-3 py-1.5 text-xs font-semibold text-[#44403C] hover:border-[#DC1F26]"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          <span>Close</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditJobModal(job)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D6D3D1] px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:border-[#1C1917]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>

                      {confirmDeleteJobId === job.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => archiveOrDeleteJob(job, isSuperAdmin)}
                            className="cursor-pointer rounded-lg bg-[#DC1F26] px-3 py-1.5 text-xs font-bold text-white"
                          >
                            {isSuperAdmin ? 'নিশ্চিত Delete' : 'নিশ্চিত Archive'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteJobId(null)}
                            className="cursor-pointer rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 text-xs font-semibold text-[#57534E]"
                          >
                            বাতিল
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteJobId(job.id)}
                          title={isSuperAdmin ? 'Delete Circular' : 'Archive Circular'}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{isSuperAdmin ? 'Delete' : 'Archive'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EXAM MANAGEMENT PANEL (only visible under Exam Candidates tab) */}
      {subTab === 'exams' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleCreateExamTemplate}
            className="space-y-3.5 rounded-xl border border-purple-200 bg-white p-5 lg:col-span-7"
          >
            <div className="border-b border-[#F5F4F0] pb-2.5">
              <h3 className="font-display text-lg font-bold text-[#1C1917]">
                নতুন পরীক্ষা তৈরি করুন (/jobExams)
              </h3>
              <p className="text-[11px] text-[#57534E]">
                এখানে পরীক্ষার সময়সূচি তৈরি করলে নিচের প্রার্থী বিস্তারিত প্যানেল থেকে এক ক্লিকে প্রার্থীদের জন্য নির্ধারণ করা যাবে।
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Exam Title *</label>
                <input
                  type="text"
                  required
                  value={examForm.title}
                  onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                  placeholder="যেমন: লিখিত ও মৌখিক পরীক্ষা - ২০২৬"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Job *</label>
                <select
                  value={examForm.jobId}
                  onChange={(e) => setExamForm({ ...examForm, jobId: e.target.value })}
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                >
                  <option value="">পদ নির্বাচন করুন</option>
                  {visibleJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Exam Date *</label>
                <input
                  type="date"
                  required
                  value={examForm.examDate}
                  onChange={(e) => setExamForm({ ...examForm, examDate: e.target.value })}
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Duration *</label>
                <input
                  type="text"
                  required
                  value={examForm.duration}
                  onChange={(e) => setExamForm({ ...examForm, duration: e.target.value })}
                  placeholder="যেমন: ৯০ মিনিট"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Start Time *</label>
                <input
                  type="text"
                  required
                  value={examForm.startTime}
                  onChange={(e) => setExamForm({ ...examForm, startTime: e.target.value })}
                  placeholder="10:00 AM"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">End Time *</label>
                <input
                  type="text"
                  required
                  value={examForm.endTime}
                  onChange={(e) => setExamForm({ ...examForm, endTime: e.target.value })}
                  placeholder="11:30 AM"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Exam Type</label>
                <input
                  type="text"
                  value={examForm.examType}
                  onChange={(e) => setExamForm({ ...examForm, examType: e.target.value })}
                  placeholder="Written + Viva / Practical"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Location *</label>
                <input
                  type="text"
                  required
                  value={examForm.location}
                  onChange={(e) => setExamForm({ ...examForm, location: e.target.value })}
                  placeholder="বগুড়া প্রধান কার্যালয়"
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Total Marks *</label>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  required
                  value={examForm.totalMarks}
                  onChange={(e) =>
                    setExamForm({ ...examForm, totalMarks: Number(e.target.value) || 100 })
                  }
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold">Pass Marks *</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  required
                  value={examForm.passMarks}
                  onChange={(e) =>
                    setExamForm({ ...examForm, passMarks: Number(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold">Instructions</label>
                <textarea
                  rows={2}
                  value={examForm.instructions}
                  onChange={(e) => setExamForm({ ...examForm, instructions: e.target.value })}
                  className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingExamTemplate}
              className="cursor-pointer rounded-lg bg-purple-700 px-5 py-2 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-60"
            >
              {savingExamTemplate ? 'সংরক্ষণ হচ্ছে...' : 'পরীক্ষা টেমপ্লেট তৈরি করুন'}
            </button>
          </form>

          <div className="space-y-3 rounded-xl border border-[#E7E5E4] bg-white p-5 lg:col-span-5">
            <h3 className="border-b border-[#F5F4F0] pb-2.5 text-sm font-bold text-[#1C1917]">
              সংরক্ষিত পরীক্ষা তালিকা ({exams.length})
            </h3>
            {exams.length === 0 ? (
              <p className="py-10 text-center text-xs text-[#78716C]">
                এখনো কোনো পরীক্ষা টেমপ্লেট তৈরি করা হয়নি।
              </p>
            ) : (
              <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
                {exams.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-[#1C1917]">{ex.title}</p>
                        <p className="text-[11px] text-[#57534E]">{ex.jobTitle}</p>
                      </div>
                      <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                        {ex.totalMarks} নম্বর
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#44403C]">
                      {formatRecruitmentDateBn(ex.examDate)} · {ex.startTime} – {ex.endTime} ({ex.duration})
                    </p>
                    <p className="text-[11px] text-[#78716C]">{ex.location}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CANDIDATE LIST & WORKFLOW WORKSPACE */}
      {isCandidateListTab && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[#E7E5E4] bg-white p-4 sm:grid-cols-12">
            <div className="relative sm:col-span-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#78716C]" />
              <input
                type="search"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                placeholder="Application ID, নাম, মোবাইল, NID, ইমেইল..."
                className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] py-2 pl-8 pr-3 text-xs focus:border-[#DC1F26] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <select
                value={appJobFilter}
                onChange={(e) => setAppJobFilter(e.target.value)}
                className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
              >
                <option value="all">সব পদ / বিজ্ঞপ্তি</option>
                {visibleJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <select
                value={appStatusFilter}
                onChange={(e) => setAppStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
              >
                <option value="all">সব স্ট্যাটাস</option>
                {APPLICATION_STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <input
                type="date"
                value={appDateFilter}
                onChange={(e) => setAppDateFilter(e.target.value)}
                title="আবেদনের তারিখ দিয়ে ফিল্টার করুন"
                className="w-full rounded-lg border border-[#D6D3D1] bg-[#FAFAF8] px-3 py-2 text-xs"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#57534E] sm:col-span-1">
              <input
                type="checkbox"
                checked={showArchivedApps}
                onChange={(e) => setShowArchivedApps(e.target.checked)}
              />
              <span>Archive</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Applications Table / List */}
            <div className="space-y-3 lg:col-span-6">
              {paginatedApplications.length === 0 ? (
                <div className="rounded-xl border border-[#E7E5E4] bg-white p-10 text-center text-xs text-[#78716C]">
                  কোনো আবেদন পাওয়া যায়নি।
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden overflow-x-auto rounded-xl border border-[#E7E5E4] bg-white md:block">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E7E5E4] bg-[#FAFAF8] text-[11px] font-bold text-[#57534E]">
                          <th className="px-3 py-2.5">Application ID</th>
                          <th className="px-3 py-2.5">Applicant Name</th>
                          <th className="px-3 py-2.5">Position</th>
                          <th className="px-3 py-2.5">Mobile</th>
                          <th className="px-3 py-2.5">Date</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F4F0]">
                        {paginatedApplications.map((app) => {
                          const st = APPLICATION_STATUS_META[app.status];
                          const isSelected = selectedApp?.id === app.id;
                          return (
                            <tr
                              key={app.id}
                              onClick={() => openApplicationDetail(app)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-[#FEF2F2]/60' : 'hover:bg-[#FAFAF8]'
                              }`}
                            >
                              <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-[#DC1F26] whitespace-nowrap">
                                {app.applicationCode}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-[#1C1917]">
                                {app.fullName}
                              </td>
                              <td className="px-3 py-2.5 text-[#57534E]">
                                {app.appliedPosition || app.jobTitle}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-[#44403C]">
                                {app.mobile}
                              </td>
                              <td className="px-3 py-2.5 text-[11px] text-[#78716C] whitespace-nowrap">
                                {app.submittedDateText}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${st.badgeClass}`}
                                >
                                  {st.labelEn}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openApplicationDetail(app);
                                  }}
                                  className="cursor-pointer rounded border border-[#D6D3D1] bg-white px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26]"
                                >
                                  View
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List */}
                  <div className="space-y-2.5 md:hidden">
                    {paginatedApplications.map((app) => {
                      const st = APPLICATION_STATUS_META[app.status];
                      return (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => openApplicationDetail(app)}
                          className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-all ${
                            selectedApp?.id === app.id
                              ? 'border-[#DC1F26] bg-white shadow-sm'
                              : 'border-[#E7E5E4] bg-white hover:border-[#D6D3D1]'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-[#DC1F26]">
                              {app.applicationCode}
                            </span>
                            <span
                              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${st.badgeClass}`}
                            >
                              {st.labelEn}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm font-bold text-[#1C1917]">
                            {app.fullName}
                          </p>
                          <p className="text-xs text-[#57534E]">
                            পদ: {app.appliedPosition || app.jobTitle}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-[#78716C]">
                            {app.mobile} · {app.submittedDateText}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between rounded-xl border border-[#E7E5E4] bg-white px-4 py-2.5 text-xs">
                      <span className="text-[#57534E] tabular-nums">
                        পৃষ্ঠা {safePage} / {totalPages} (মোট {stageApplications.length})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={safePage <= 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
                        >
                          আগে
                        </button>
                        <button
                          type="button"
                          disabled={safePage >= totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          className="cursor-pointer rounded border border-[#D6D3D1] px-2.5 py-1 font-semibold disabled:opacity-40"
                        >
                          পরে
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Application Full Detail & Workflow Panel */}
            <div className="lg:col-span-6">
              {selectedApp ? (
                <div className="space-y-5 rounded-xl border border-[#E7E5E4] bg-white p-5 sm:p-6">
                  {/* Top Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F5F4F0] pb-4">
                    <div className="flex items-start gap-3">
                      {(selectedApp.photoUrl || selectedApp.photoDataUrl) && (
                        <a
                          href={selectedApp.photoUrl || selectedApp.photoDataUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ছবি বড় করে দেখুন"
                        >
                          <img
                            src={selectedApp.photoUrl || selectedApp.photoDataUrl}
                            alt={selectedApp.fullName}
                            className="h-16 w-16 rounded-xl border border-[#E7E5E4] object-cover"
                          />
                        </a>
                      )}
                      <div>
                        <p className="font-mono text-xs font-bold text-[#DC1F26]">
                          {selectedApp.applicationCode}
                        </p>
                        <h3 className="font-display text-xl font-bold text-[#1C1917]">
                          {selectedApp.fullName}
                        </h3>
                        <p className="text-xs text-[#57534E]">
                          পদের নাম:{' '}
                          <strong>{selectedApp.appliedPosition || selectedApp.jobTitle}</strong> ·{' '}
                          {selectedApp.submittedDateText}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          persistApplicationUpdate({
                            app: selectedApp,
                            status: selectedApp.status,
                            notes: adminNotes,
                            archived: !selectedApp.archived,
                            historyNote: selectedApp.archived
                              ? 'আর্কাইভ থেকে পুনরুদ্ধার করা হয়েছে।'
                              : 'আবেদন আর্কাইভ করা হয়েছে।',
                          })
                        }
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#D6D3D1] px-3 py-1.5 text-xs font-semibold text-[#44403C] hover:border-[#1C1917]"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        <span>{selectedApp.archived ? 'Unarchive' : 'Archive'}</span>
                      </button>

                      {isSuperAdmin &&
                        (confirmDeleteAppId === selectedApp.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={savingApp}
                              onClick={() => handleDeleteApplicationPermanent(selectedApp)}
                              className="cursor-pointer rounded-lg bg-[#DC1F26] px-3 py-1.5 text-xs font-bold text-white"
                            >
                              নিশ্চিত Delete করুন
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAppId(null)}
                              className="cursor-pointer rounded-lg border border-[#D6D3D1] px-2.5 py-1.5 text-xs font-semibold text-[#57534E]"
                            >
                              বাতিল
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAppId(selectedApp.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* 7 Quick-Action Workflow Buttons */}
                  <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
                    <p className="mb-2 text-[11px] font-bold text-[#57534E]">
                      দ্রুত সিদ্ধান্ত (Quick Workflow Actions)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction('Under Review', 'আবেদনটি পর্যালোচনাধীন করা হয়েছে।')
                        }
                        className="cursor-pointer rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        Under Review
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction(
                            'Shortlisted',
                            'প্রার্থীকে সংক্ষিপ্ত তালিকাভুক্ত (Shortlisted) করা হয়েছে।',
                            true
                          )
                        }
                        className="cursor-pointer rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        Shortlist
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction(
                            'Exam Scheduled',
                            'পরীক্ষার জন্য নির্বাচন (Exam Scheduled) করা হয়েছে।',
                            true
                          )
                        }
                        className="cursor-pointer rounded-lg border border-purple-300 bg-purple-50 px-2.5 py-1.5 text-[11px] font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-50"
                      >
                        Select for Exam
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction(
                            'Exam Completed',
                            'প্রার্থীর পরীক্ষা সম্পন্ন (Exam Completed) হিসেবে চিহ্নিত করা হয়েছে।',
                            true
                          )
                        }
                        className="cursor-pointer rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-bold text-cyan-900 hover:bg-cyan-100 disabled:opacity-50"
                      >
                        Mark Exam Completed
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction(
                            'Interview',
                            'মৌখিক পরীক্ষা / ইন্টারভিউয়ের জন্য নির্বাচিত।',
                            true
                          )
                        }
                        className="cursor-pointer rounded-lg border border-yellow-400 bg-yellow-50 px-2.5 py-1.5 text-[11px] font-bold text-yellow-900 hover:bg-yellow-100 disabled:opacity-50"
                      >
                        Select for Interview
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction(
                            'Selected',
                            'প্রার্থীকে চূড়ান্তভাবে নির্বাচিত (Selected) করা হয়েছে।',
                            true
                          )
                        }
                        className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        Select (চূড়ান্ত)
                      </button>
                      <button
                        type="button"
                        disabled={savingApp}
                        onClick={() =>
                          handleQuickAction('Rejected', 'আবেদনটি অনির্বাচিত (Rejected) করা হয়েছে।')
                        }
                        className="cursor-pointer rounded-lg bg-[#DC1F26] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#B91C1C] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {/* Personal, Contact, Education & Experience Grid */}
                  <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                    <div className="space-y-1.5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
                      <p className="font-bold text-[#1C1917]">ব্যক্তিগত ও যোগাযোগের তথ্য</p>
                      <p>
                        মোবাইল: <strong className="font-mono">{selectedApp.mobile}</strong>
                        {selectedApp.alternativeMobile
                          ? ` · বিকল্প: ${selectedApp.alternativeMobile}`
                          : ''}
                      </p>
                      {selectedApp.email && <p>ইমেইল: {selectedApp.email}</p>}
                      {selectedApp.nidNumber && (
                        <p>
                          NID / জন্ম নিবন্ধন:{' '}
                          <strong className="font-mono">{selectedApp.nidNumber}</strong>
                        </p>
                      )}
                      {selectedApp.passportNumber && (
                        <p className="font-mono">Passport: {selectedApp.passportNumber}</p>
                      )}
                      {selectedApp.fatherName && <p>পিতার নাম: {selectedApp.fatherName}</p>}
                      {selectedApp.motherName && <p>মাতার নাম: {selectedApp.motherName}</p>}
                      <p>
                        জন্ম তারিখ: {selectedApp.dateOfBirth} · লিঙ্গ: {selectedApp.gender}
                        {selectedApp.maritalStatus ? ` · ${selectedApp.maritalStatus}` : ''}
                      </p>
                      {selectedApp.nationality && <p>জাতীয়তা: {selectedApp.nationality}</p>}
                      <p>বর্তমান ঠিকানা: {selectedApp.presentAddress}</p>
                      {selectedApp.permanentAddress && (
                        <p>স্থায়ী ঠিকানা: {selectedApp.permanentAddress}</p>
                      )}
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
                      <p className="font-bold text-[#1C1917]">শিক্ষা ও অভিজ্ঞতা</p>
                      <p>
                        শিক্ষাগত যোগ্যতা: <strong>{selectedApp.educationLevel}</strong>
                        {selectedApp.subjectDepartment
                          ? ` (${selectedApp.subjectDepartment})`
                          : ''}
                      </p>
                      {selectedApp.institution && <p>প্রতিষ্ঠান: {selectedApp.institution}</p>}
                      {(selectedApp.passingYear || selectedApp.resultGpa) && (
                        <p>
                          পাশের সাল: {selectedApp.passingYear || '—'} · ফলাফল:{' '}
                          {selectedApp.resultGpa || '—'}
                        </p>
                      )}
                      <p>
                        পূর্বের অভিজ্ঞতা:{' '}
                        {selectedApp.hasPreviousExperience
                          ? `হ্যাঁ (${selectedApp.experienceYears || '—'} · ${
                              selectedApp.previousOrganization || '—'
                            })`
                          : 'নেই'}
                      </p>
                      {selectedApp.currentOccupation && (
                        <p>বর্তমান পেশা: {selectedApp.currentOccupation}</p>
                      )}
                      {selectedApp.expectedSalary && (
                        <p>প্রত্যাশিত বেতন: {selectedApp.expectedSalary}</p>
                      )}
                      {selectedApp.computerSkills && (
                        <p>কম্পিউটার দক্ষতা: {selectedApp.computerSkills}</p>
                      )}
                      {selectedApp.languageSkills && (
                        <p>ভাষা: {selectedApp.languageSkills}</p>
                      )}
                    </div>
                  </div>

                  {/* Additional Info & Uploaded Documents */}
                  {(selectedApp.aboutSelf ||
                    selectedApp.skills ||
                    selectedApp.referenceInfo ||
                    selectedApp.cvUrlOrNote ||
                    applicantDocList(selectedApp).length > 0) && (
                    <div className="space-y-2.5 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5 text-xs">
                      <p className="font-bold text-[#1C1917]">অতিরিক্ত তথ্য ও সংযুক্ত ডকুমেন্ট</p>
                      {selectedApp.aboutSelf && (
                        <p className="whitespace-pre-line text-[#44403C]">
                          {selectedApp.aboutSelf}
                        </p>
                      )}
                      {selectedApp.skills && (
                        <p>
                          <strong>Skills:</strong> {selectedApp.skills}
                        </p>
                      )}
                      {selectedApp.referenceInfo && (
                        <p>
                          <strong>Reference:</strong> {selectedApp.referenceInfo}
                        </p>
                      )}
                      {selectedApp.cvUrlOrNote && (
                        <p>
                          <strong>CV / Note:</strong> {selectedApp.cvUrlOrNote}
                        </p>
                      )}

                      {applicantDocList(selectedApp).length > 0 && (
                        <div className="pt-1">
                          <p className="mb-1.5 font-semibold text-[#1C1917]">
                            সংযুক্ত ফাইল (Firebase Storage):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {applicantDocList(selectedApp).map((docRef, idx) => (
                              <a
                                key={idx}
                                href={docRef.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6D3D1] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1C1917] hover:border-[#DC1F26] hover:text-[#DC1F26]"
                              >
                                <FileText className="h-3.5 w-3.5 text-[#DC1F26]" />
                                <span className="max-w-[160px] truncate">{docRef.name}</span>
                                <Download className="h-3 w-3 text-[#78716C]" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status & Notes Update Form */}
                  <form
                    onSubmit={handleSaveStatusAndNotes}
                    className="space-y-3 rounded-xl border border-[#E7E5E4] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#1C1917]">
                        <FileCheck2 className="h-4 w-4 text-[#DC1F26]" />
                        <span>আবেদন স্ট্যাটাস ও অ্যাডমিন নোট</span>
                      </h4>
                      {selectedApp.reviewedBy && (
                        <span className="font-mono text-[10px] text-[#78716C]">
                          Reviewed by: {selectedApp.reviewedBy}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Status</label>
                        <select
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value as JobApplicationStatus)}
                          className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                        >
                          {APPLICATION_STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st}>
                              {st} ({APPLICATION_STATUS_META[st].labelBn})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={savingApp}
                          className="w-full cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-60"
                        >
                          {savingApp ? 'সেভ হচ্ছে...' : 'স্ট্যাটাস ও নোট সেভ করুন'}
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="ইন্টারনাল অ্যাডমিন নোট লিখুন..."
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                    />
                  </form>

                  {/* Exam Scheduling / Assignment Form */}
                  <form
                    onSubmit={handleScheduleExam}
                    className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                        <CalendarClock className="h-4 w-4" />
                        <span>পরীক্ষা নির্ধারণ (Exam Assignment)</span>
                      </h4>
                      {exams.length > 0 && (
                        <select
                          value={selectedExamTemplateId}
                          onChange={(e) => applyExamTemplateToCandidateForm(e.target.value)}
                          className="rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-900"
                        >
                          <option value="">টেমপ্লেট থেকে লোড করুন...</option>
                          {exams.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              {ex.title} ({ex.examDate})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Exam Title</label>
                        <input
                          type="text"
                          value={examTitle}
                          onChange={(e) => setExamTitle(e.target.value)}
                          placeholder="যেমন: লিখিত পরীক্ষা - মে ২০২৬"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">পরীক্ষার তারিখ *</label>
                        <input
                          type="date"
                          value={examDate}
                          onChange={(e) => setExamDate(e.target.value)}
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">শুরুর সময়</label>
                        <input
                          type="text"
                          value={examStartTime}
                          onChange={(e) => setExamStartTime(e.target.value)}
                          placeholder="10:00 AM"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">শেষের সময়</label>
                        <input
                          type="text"
                          value={examEndTime}
                          onChange={(e) => setExamEndTime(e.target.value)}
                          placeholder="11:30 AM"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">প্রদর্শিত সময় *</label>
                        <input
                          type="text"
                          value={examTime}
                          onChange={(e) => setExamTime(e.target.value)}
                          placeholder="সকাল ১০:০০ – ১১:৩০"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Duration</label>
                        <input
                          type="text"
                          value={examDuration}
                          onChange={(e) => setExamDuration(e.target.value)}
                          placeholder="৯০ মিনিট"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">পরীক্ষার স্থান *</label>
                        <input
                          type="text"
                          value={examLocation}
                          onChange={(e) => setExamLocation(e.target.value)}
                          placeholder="বগুড়া প্রধান কার্যালয়"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">পরীক্ষার ধরন</label>
                        <input
                          type="text"
                          value={examType}
                          onChange={(e) => setExamType(e.target.value)}
                          placeholder="Written / Viva / Practical"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Total Marks</label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={examTotalMarks}
                          onChange={(e) => setExamTotalMarks(Number(e.target.value) || 0)}
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Pass Marks</label>
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={examPassMarks}
                          onChange={(e) => setExamPassMarks(Number(e.target.value) || 0)}
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[11px] font-semibold">নির্দেশনা</label>
                        <input
                          type="text"
                          value={examInstructions}
                          onChange={(e) => setExamInstructions(e.target.value)}
                          placeholder="মূল এনআইডি ও শিক্ষাগত সনদপত্রের ফটোকপি সাথে আনবেন"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingApp}
                      className="cursor-pointer rounded-lg bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-800 disabled:opacity-60"
                    >
                      Exam Scheduled সেভ করুন
                    </button>
                  </form>

                  {/* Interview Scheduling Form */}
                  <form
                    onSubmit={handleScheduleInterview}
                    className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/30 p-4"
                  >
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#854D0E]">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>মৌখিক পরীক্ষা / ইন্টারভিউ নির্ধারণ</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">তারিখ *</label>
                        <input
                          type="date"
                          value={interviewDate}
                          onChange={(e) => setInterviewDate(e.target.value)}
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">সময় *</label>
                        <input
                          type="text"
                          value={interviewTime}
                          onChange={(e) => setInterviewTime(e.target.value)}
                          placeholder="দুপুর ৩:০০ টা"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">স্থান *</label>
                        <input
                          type="text"
                          value={interviewLocation}
                          onChange={(e) => setInterviewLocation(e.target.value)}
                          placeholder="প্রধান অফিস"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Interview Type</label>
                        <input
                          type="text"
                          value={interviewType}
                          onChange={(e) => setInterviewType(e.target.value)}
                          placeholder="In-person / Online"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">Interview Status</label>
                        <select
                          value={interviewStatus}
                          onChange={(e) =>
                            setInterviewStatus(e.target.value as JobInterviewStatus)
                          }
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold">নোট</label>
                        <input
                          type="text"
                          value={interviewNotes}
                          onChange={(e) => setInterviewNotes(e.target.value)}
                          placeholder="ইন্টারভিউ নোট"
                          className="w-full rounded-lg border border-[#D6D3D1] bg-white px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingApp}
                      className="cursor-pointer rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#DC1F26] disabled:opacity-60"
                    >
                      Interview Schedule সেভ করুন
                    </button>
                  </form>

                  {/* Status History */}
                  {selectedApp.statusHistory && selectedApp.statusHistory.length > 0 && (
                    <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
                      <h4 className="mb-2 text-xs font-bold text-[#1C1917]">
                        আবেদন ইতিহাস (Status History)
                      </h4>
                      <div className="space-y-1.5 text-[11px]">
                        {selectedApp.statusHistory.map((h, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap items-center justify-between gap-2"
                          >
                            <span>
                              <strong className="text-[#1C1917]">{h.status}</strong>
                              {h.note ? ` — ${h.note}` : ''}
                            </span>
                            <span className="font-mono text-[#78716C]">
                              {h.changedBy || 'Candidate'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center rounded-xl border border-[#E7E5E4] bg-white p-6 text-center text-xs text-[#78716C]">
                  বিস্তারিত তথ্য দেখতে এবং পরীক্ষা/ইন্টারভিউ নির্ধারণ করতে বাম পাশ থেকে একটি আবেদন নির্বাচন করুন।
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT JOB CIRCULAR MODAL */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-[#F5F4F0] pb-4">
              <h3 className="font-display text-xl font-bold text-[#1C1917]">
                {jobForm.id ? 'নিয়োগ বিজ্ঞপ্তি এডিট করুন' : 'নতুন নিয়োগ বিজ্ঞপ্তি তৈরি করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-[#57534E] hover:bg-[#F5F4F0]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveJob} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    পদের নাম (বাংলা/মূল) *
                  </label>
                  <input
                    type="text"
                    required
                    value={jobForm.title}
                    onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                    placeholder="যেমন: ডেলিভারি ম্যান / সেলসম্যান"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    Job Title (English Optional)
                  </label>
                  <input
                    type="text"
                    value={jobForm.titleEn}
                    onChange={(e) => setJobForm({ ...jobForm, titleEn: e.target.value })}
                    placeholder="e.g. Delivery Executive"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">বিভাগ / Department</label>
                  <input
                    type="text"
                    value={jobForm.department}
                    onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })}
                    placeholder="যেমন: Sales & Distribution / Bakery Operations"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">চাকরির ক্যাটাগরি *</label>
                  <select
                    value={jobForm.category}
                    onChange={(e) => setJobForm({ ...jobForm, category: e.target.value })}
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  >
                    {JOB_CATEGORY_PRESETS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="CUSTOM">+ নতুন কাস্টম ক্যাটাগরি লিখুন</option>
                  </select>
                </div>

                {jobForm.category === 'CUSTOM' && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold">
                      কাস্টম ক্যাটাগরির নাম *
                    </label>
                    <input
                      type="text"
                      required
                      value={jobForm.customCategory}
                      onChange={(e) =>
                        setJobForm({ ...jobForm, customCategory: e.target.value })
                      }
                      placeholder="যেমন: স্টোর ইনচার্জ"
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-semibold">শূন্যপদ সংখ্যা *</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={jobForm.vacancies}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, vacancies: Number(e.target.value) || 1 })
                    }
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">কর্মস্থল *</label>
                  <input
                    type="text"
                    required
                    value={jobForm.workplace}
                    onChange={(e) => setJobForm({ ...jobForm, workplace: e.target.value })}
                    placeholder="যেমন: বগুড়া শোরুম / প্রধান অফিস"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">বেতন *</label>
                  <input
                    type="text"
                    required
                    value={jobForm.salary}
                    onChange={(e) => setJobForm({ ...jobForm, salary: e.target.value })}
                    placeholder="যেমন: ১৫,০০০ – ২০,০০০ টাকা"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">বেতনের ধরন</label>
                  <select
                    value={jobForm.salaryType}
                    onChange={(e) => setJobForm({ ...jobForm, salaryType: e.target.value })}
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  >
                    {SALARY_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelBn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">চাকরির ধরন *</label>
                  <select
                    value={jobForm.employmentType}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, employmentType: e.target.value })
                    }
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.labelBn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">কাজের সময় / শিফট</label>
                  <input
                    type="text"
                    value={jobForm.workingHours}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, workingHours: e.target.value })
                    }
                    placeholder="সকাল ৯:০০ – সন্ধ্যা ৬:০০"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    আবেদন শুরুর তারিখ *
                  </label>
                  <input
                    type="date"
                    required
                    value={jobForm.startDate}
                    onChange={(e) => setJobForm({ ...jobForm, startDate: e.target.value })}
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    আবেদনের শেষ তারিখ *
                  </label>
                  <input
                    type="date"
                    required
                    value={jobForm.deadline}
                    onChange={(e) => setJobForm({ ...jobForm, deadline: e.target.value })}
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">শিক্ষাগত যোগ্যতা</label>
                  <input
                    type="text"
                    value={jobForm.educationRequirement}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, educationRequirement: e.target.value })
                    }
                    placeholder="ন্যূনতম এসএসসি / এইচএসসি পাশ"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">অভিজ্ঞতা</label>
                  <input
                    type="text"
                    value={jobForm.experienceRequirement}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, experienceRequirement: e.target.value })
                    }
                    placeholder="১–২ বছরের অভিজ্ঞতা অগ্রাধিকার"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold">কাজের বিবরণ *</label>
                  <textarea
                    rows={3}
                    required
                    value={jobForm.description}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, description: e.target.value })
                    }
                    placeholder="পদটি সম্পর্কে বিস্তারিত বিবরণ লিখুন..."
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    দায়িত্ব ও কর্তব্য (প্রতি লাইনে একটি)
                  </label>
                  <textarea
                    rows={4}
                    value={jobForm.responsibilitiesText}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, responsibilitiesText: e.target.value })
                    }
                    placeholder="পণ্য সঠিকভাবে ডেলিভারি করা&#10;ক্রেতাদের সাথে ভদ্র আচরণ করা"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    প্রয়োজনীয় যোগ্যতা (প্রতি লাইনে একটি)
                  </label>
                  <textarea
                    rows={4}
                    value={jobForm.requirementsText}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, requirementsText: e.target.value })
                    }
                    placeholder="জাতীয় পরিচয়পত্র থাকতে হবে&#10;সৎ ও পরিশ্রমী হতে হবে"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold">
                    অন্যান্য সুবিধা (প্রতি লাইনে একটি)
                  </label>
                  <textarea
                    rows={3}
                    value={jobForm.benefitsText}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, benefitsText: e.target.value })
                    }
                    placeholder="উৎসব বোনাস&#10;দুপুরের খাবার / যাতায়াত ভাতা"
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">স্ট্যাটাস *</label>
                    <select
                      value={jobForm.status}
                      onChange={(e) =>
                        setJobForm({
                          ...jobForm,
                          status: e.target.value as JobCircularStatus,
                        })
                      }
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-sm font-semibold"
                    >
                      <option value="Draft">Draft (খসড়া)</option>
                      <option value="Published">Published (প্রকাশিত)</option>
                      <option value="Hidden">Hidden (গোপন)</option>
                      <option value="Closed">Closed (বন্ধ)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">যোগাযোগের তথ্য</label>
                    <input
                      type="text"
                      value={jobForm.contactInfo}
                      onChange={(e) =>
                        setJobForm({ ...jobForm, contactInfo: e.target.value })
                      }
                      placeholder="হটলাইন / এইচআর ফোন নম্বর"
                      className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold">বিশেষ নির্দেশনা</label>
                  <input
                    type="text"
                    value={jobForm.instructions}
                    onChange={(e) =>
                      setJobForm({ ...jobForm, instructions: e.target.value })
                    }
                    placeholder="আবেদনকারীদের উদ্দেশ্যে কোনো বিশেষ নির্দেশনা..."
                    className="w-full rounded-lg border border-[#D6D3D1] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 border-t border-[#F5F4F0] pt-4">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="cursor-pointer rounded-lg border border-[#D6D3D1] px-4 py-2 text-xs font-semibold text-[#44403C]"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={savingJob}
                  className="cursor-pointer rounded-lg bg-[#DC1F26] px-6 py-2 text-xs font-bold text-white hover:bg-[#B91C1C] disabled:opacity-60"
                >
                  {savingJob ? 'সেভ হচ্ছে...' : 'বিজ্ঞপ্তি সেভ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
        active
          ? 'border-[#1C1917] bg-[#1C1917] text-white'
          : 'border-[#E7E5E4] bg-white text-[#44403C] hover:border-[#D6D3D1]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-[#E7E5E4] bg-white p-4">
      <p className="text-[11px] font-medium text-[#78716C]">{label}</p>
      <p className={`font-mono mt-1 text-2xl font-bold tabular-nums ${accent}`}>
        {value}
      </p>
    </div>
  );
}
