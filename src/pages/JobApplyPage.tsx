import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Upload,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ApplicationStatusTracker } from '../components/ApplicationStatusTracker';
import { resolveBilingualPair } from '../lib/bilingual';
import {
  OperationType,
  db,
  handleFirestoreError,
} from '../lib/firebase';
import {
  computeJobApplicationLock,
  computeMobileVerificationHash,
  formatRecruitmentDateEn,
  getJobCategoryDisplay,
  getJobWindowLabelEn,
  getJobWindowState,
  getLocalTodayIso,
  isValidBdMobile,
  isValidOptionalEmail,
  normalizeBdMobile,
  normalizeNidNumber,
  reserveNextApplicationId,
  sanitizeUploadFileName,
  uploadRecruitmentFile,
  validateDocumentFile,
  validatePhotoFile,
} from '../lib/recruitment';
import type { JobApplicationDocumentRef, JobApplicationDocumentUrls, JobPosting } from '../types';

export function JobApplyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [job, setJob] = useState<JobPosting | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  // Section A: Personal Information
  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('পুরুষ');
  const [maritalStatus, setMaritalStatus] = useState('অবিবাহিত');
  const [nationality, setNationality] = useState('Bangladeshi');
  const [nidNumber, setNidNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');

  // Section B: Contact Information
  const [mobile, setMobile] = useState('');
  const [alternativeMobile, setAlternativeMobile] = useState('');
  const [email, setEmail] = useState('');
  const [presentAddress, setPresentAddress] = useState('');
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [permanentAddress, setPermanentAddress] = useState('');

  // Section C: Educational Qualification
  const [educationLevel, setEducationLevel] = useState('');
  const [subjectDepartment, setSubjectDepartment] = useState('');
  const [institution, setInstitution] = useState('');
  const [passingYear, setPassingYear] = useState('');
  const [resultGpa, setResultGpa] = useState('');

  // Section D: Experience & Position
  const [appliedPosition, setAppliedPosition] = useState('');
  const [hasPreviousExperience, setHasPreviousExperience] = useState(false);
  const [experienceYears, setExperienceYears] = useState('');
  const [previousOrganization, setPreviousOrganization] = useState('');
  const [currentOccupation, setCurrentOccupation] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');

  // Section E: Skills & Additional Information
  const [computerSkills, setComputerSkills] = useState('');
  const [languageSkills, setLanguageSkills] = useState('Bengali (Native), English');
  const [skills, setSkills] = useState('');
  const [aboutSelf, setAboutSelf] = useState('');
  const [referenceInfo, setReferenceInfo] = useState('');
  const [cvUrlOrNote, setCvUrlOrNote] = useState('');

  // Section F: Photo & Documents
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [nidFile, setNidFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [eduFile, setEduFile] = useState<File | null>(null);
  const [otherFile, setOtherFile] = useState<File | null>(null);

  // Section G: Declaration
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitStepLabel, setSubmitStepLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [submittedMobile, setSubmittedMobile] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    let active = true;
    const loadJob = async () => {
      if (!db || !slug) {
        if (active) setLoadingJob(false);
        return;
      }
      setLoadingJob(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'jobPostings'),
            where('status', '==', 'Published'),
            where('slug', '==', slug),
            limit(1)
          )
        );
        if (!active) return;
        let foundJob: JobPosting | null = null;
        if (!snap.empty) {
          const data = snap.docs[0].data() as JobPosting;
          if (!data.deleted) foundJob = data;
        } else if (/^[a-zA-Z0-9_-]{1,128}$/.test(slug)) {
          try {
            const byIdSnap = await getDoc(doc(db, 'jobPostings', slug));
            if (byIdSnap.exists()) {
              const data = byIdSnap.data() as JobPosting;
              if (data.status === 'Published' && !data.deleted) {
                foundJob = data;
              }
            }
          } catch {
            // Ignored cleanly
          }
        }
        if (!active) return;
        if (foundJob) {
          setJob(foundJob);
          const titleInfo = resolveBilingualPair(foundJob.titleEn, foundJob.title);
          setAppliedPosition(titleInfo.primary);
          document.title = `Apply: ${titleInfo.primary} – Careers | Home Recipe Foods`;
        } else {
          setJob(null);
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.LIST, `jobPostings/${slug}`);
        } catch {
          // Handled cleanly
        }
      } finally {
        if (active) setLoadingJob(false);
      }
    };

    void loadJob();
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const progressSummary = useMemo(() => {
    const checks = [
      Boolean(fullName.trim() && dateOfBirth && gender && nidNumber.trim()),
      Boolean(isValidBdMobile(mobile) && presentAddress.trim()),
      Boolean(educationLevel.trim()),
      Boolean(appliedPosition.trim()),
      Boolean(photoFile),
      declarationAccepted,
    ];
    const done = checks.filter(Boolean).length;
    return {
      done,
      total: checks.length,
      percent: Math.round((done / checks.length) * 100),
    };
  }, [
    fullName,
    dateOfBirth,
    gender,
    nidNumber,
    mobile,
    presentAddress,
    educationLevel,
    appliedPosition,
    photoFile,
    declarationAccepted,
  ]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validatePhotoFile(file);
    if (err) {
      setErrorMsg(err);
      e.target.value = '';
      return;
    }
    setErrorMsg(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleDocFileChange = (
    setter: (f: File | null) => void,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateDocumentFile(file);
    if (err) {
      setErrorMsg(err);
      e.target.value = '';
      return;
    }
    setErrorMsg(null);
    setter(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!db) {
      setErrorMsg('Database connection is unavailable right now. Please try again shortly.');
      return;
    }
    const activeDb = db;

    if (!job || getJobWindowState(job) !== 'open') {
      setErrorMsg('Applications are not currently open for this position.');
      return;
    }

    if (fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!dateOfBirth.trim()) {
      setErrorMsg('Please select your date of birth.');
      return;
    }
    const cleanNid = normalizeNidNumber(nidNumber);
    if (cleanNid.length < 8) {
      setErrorMsg('Please enter a valid National ID (NID) or Birth Registration number.');
      return;
    }
    if (!isValidBdMobile(mobile)) {
      setErrorMsg('Please enter a valid 11-digit Bangladeshi mobile number (e.g. 017XXXXXXXX).');
      return;
    }
    if (alternativeMobile.trim() && !isValidBdMobile(alternativeMobile)) {
      setErrorMsg('Please enter a valid 11-digit alternative Bangladeshi mobile number.');
      return;
    }
    if (!isValidOptionalEmail(email)) {
      setErrorMsg('Please enter a valid email address or leave this field blank.');
      return;
    }
    if (presentAddress.trim().length < 3) {
      setErrorMsg('Please enter your current address.');
      return;
    }
    if (!educationLevel.trim()) {
      setErrorMsg('Please enter your highest educational qualification.');
      return;
    }
    if (!appliedPosition.trim()) {
      setErrorMsg('Please confirm the position you are applying for.');
      return;
    }
    if (!photoFile) {
      setErrorMsg('Please upload a passport-size photo (JPG/PNG, max 2 MB).');
      return;
    }
    if (!declarationAccepted) {
      setErrorMsg('Please confirm the declaration checkbox before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitStepLabel('Verifying your details...');

    try {
      const cleanMobile = normalizeBdMobile(mobile);
      const cleanAltMobile = alternativeMobile.trim()
        ? normalizeBdMobile(alternativeMobile)
        : '';

      const mobileLock = await computeJobApplicationLock(job.id, cleanMobile, 'mobile');
      const existingMobileLock = await getDoc(
        doc(activeDb, 'jobApplicationLocks', mobileLock.lockId)
      );
      if (existingMobileLock.exists()) {
        setErrorMsg('An application with this mobile number has already been submitted for this role.');
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      const nidLock = await computeJobApplicationLock(job.id, cleanNid, 'nid');
      const existingNidLock = await getDoc(
        doc(activeDb, 'jobApplicationLocks', nidLock.lockId)
      );
      if (existingNidLock.exists()) {
        setErrorMsg(
          'An application with this NID / Birth Registration number has already been submitted for this role.'
        );
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      // Step 1: Reserve deterministic SN-JOB-YYYY-00001 application ID
      setSubmitStepLabel('Generating Application ID...');
      const applicationCode = await reserveNextApplicationId(activeDb);

      // Step 2: Upload Photo & Documents (fail-fast before Firestore commit)
      setSubmitStepLabel('Uploading photo & documents...');
      let photoUrl = '';
      let photoStoragePath = '';
      const documentUrls: JobApplicationDocumentUrls = {};

      try {
        photoStoragePath = `job-applications/${applicationCode}/photo/${sanitizeUploadFileName(
          photoFile.name
        )}`;
        photoUrl = await uploadRecruitmentFile(photoStoragePath, photoFile);

        const uploadDocIfPresent = async (
          file: File | null,
          docType: JobApplicationDocumentRef['docType'],
          prefix: string
        ): Promise<JobApplicationDocumentRef | undefined> => {
          if (!file) return undefined;
          const path = `job-applications/${applicationCode}/documents/${prefix}_${sanitizeUploadFileName(
            file.name
          )}`;
          const url = await uploadRecruitmentFile(path, file);
          return {
            name: file.name.slice(0, 120),
            docType,
            url,
            storagePath: path,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
          };
        };

        const [nidRef, cvRef, eduRef, otherRef] = await Promise.all([
          uploadDocIfPresent(nidFile, 'nid_birth_cert', 'nid'),
          uploadDocIfPresent(cvFile, 'cv', 'cv'),
          uploadDocIfPresent(eduFile, 'educational_cert', 'edu'),
          uploadDocIfPresent(otherFile, 'other', 'other'),
        ]);

        if (nidRef) documentUrls.nidOrBirthCert = nidRef;
        if (cvRef) documentUrls.cv = cvRef;
        if (eduRef) documentUrls.educationalCert = eduRef;
        if (otherRef) documentUrls.otherDoc = otherRef;
      } catch (uploadErr) {
        console.error('Recruitment file upload failed:', uploadErr);
        setErrorMsg('Document upload failed. Please verify files and try again.');
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      // Step 3: Commit Firestore documents atomically
      setSubmitStepLabel('Saving your application...');
      const mobileHash = await computeMobileVerificationHash(cleanMobile);
      const submittedDateText = formatRecruitmentDateEn(getLocalTodayIso());
      const nowTs = serverTimestamp();
      const resolvedPermanentAddress = sameAsPresent
        ? presentAddress.trim()
        : permanentAddress.trim() || presentAddress.trim();

      const batch = writeBatch(db);

      batch.set(doc(db, 'jobApplications', applicationCode), {
        id: applicationCode,
        applicationCode,
        jobId: job.id,
        jobSlug: job.slug,
        jobTitle: job.title.slice(0, 160),
        jobCategory: job.category.slice(0, 100),
        fullName: fullName.trim().slice(0, 120),
        fatherName: fatherName.trim().slice(0, 120),
        motherName: motherName.trim().slice(0, 120),
        dateOfBirth: dateOfBirth.trim().slice(0, 32),
        gender: gender.trim().slice(0, 32),
        maritalStatus: maritalStatus.trim().slice(0, 40),
        nationality: (nationality.trim() || 'Bangladeshi').slice(0, 60),
        nidNumber: cleanNid.slice(0, 40),
        passportNumber: passportNumber.trim().slice(0, 40),
        mobile: cleanMobile.slice(0, 32),
        alternativeMobile: cleanAltMobile.slice(0, 32),
        email: email.trim().toLowerCase().slice(0, 254),
        presentAddress: presentAddress.trim().slice(0, 400),
        permanentAddress: resolvedPermanentAddress.slice(0, 400),
        educationLevel: educationLevel.trim().slice(0, 120),
        institution: institution.trim().slice(0, 160),
        subjectDepartment: subjectDepartment.trim().slice(0, 160),
        passingYear: passingYear.trim().slice(0, 20),
        resultGpa: resultGpa.trim().slice(0, 40),
        hasPreviousExperience,
        experienceYears: hasPreviousExperience ? experienceYears.trim().slice(0, 40) : '',
        previousOrganization: hasPreviousExperience
          ? previousOrganization.trim().slice(0, 160)
          : '',
        currentOccupation: currentOccupation.trim().slice(0, 120),
        expectedSalary: expectedSalary.trim().slice(0, 60),
        appliedPosition: appliedPosition.trim().slice(0, 160),
        computerSkills: computerSkills.trim().slice(0, 400),
        languageSkills: languageSkills.trim().slice(0, 400),
        aboutSelf: aboutSelf.trim().slice(0, 1500),
        skills: skills.trim().slice(0, 600),
        referenceInfo: referenceInfo.trim().slice(0, 400),
        photoUrl,
        photoStoragePath,
        photoDataUrl: '',
        documentUrls,
        cvUrlOrNote: cvUrlOrNote.trim().slice(0, 1000),
        declarationAccepted: true,
        status: 'Submitted',
        shortlisted: false,
        adminNotes: '',
        notes: '',
        reviewedBy: '',
        reviewedAt: '',
        statusHistory: [
          {
            status: 'Submitted',
            note: 'Submitted via online careers portal.',
            changedAt: new Date().toISOString(),
          },
        ],
        archived: false,
        deleted: false,
        submittedDateText,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      batch.set(doc(db, 'jobApplicationLocks', mobileLock.lockId), {
        id: mobileLock.lockId,
        jobId: job.id,
        keyHash: mobileLock.keyHash,
        createdAt: nowTs,
      });

      batch.set(doc(db, 'jobApplicationLocks', nidLock.lockId), {
        id: nidLock.lockId,
        jobId: job.id,
        keyHash: nidLock.keyHash,
        createdAt: nowTs,
      });

      batch.set(doc(db, 'jobApplicationStatuses', applicationCode), {
        id: applicationCode,
        jobId: job.id,
        jobTitle: job.title.slice(0, 160),
        jobCategory: job.category.slice(0, 100),
        mobileHash,
        status: 'Submitted',
        submittedDateText,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      try {
        await batch.commit();
      } catch (commitErr) {
        const msg = commitErr instanceof Error ? commitErr.message.toLowerCase() : '';
        if (msg.includes('already-exists')) {
          setErrorMsg(
            'An application using this mobile number or NID has already been submitted for this position.'
          );
        } else {
          setErrorMsg(
            'Unable to save your application. Please check your internet connection and retry.'
          );
        }
        try {
          handleFirestoreError(commitErr, OperationType.WRITE, 'jobApplications');
        } catch {
          // Logged structurally
        }
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      setSubmittedCode(applicationCode);
      setSubmittedMobile(cleanMobile);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMsg(
        'Unable to save your application. Please check your internet connection and retry.'
      );
      try {
        handleFirestoreError(err, OperationType.WRITE, 'jobApplications');
      } catch {
        // Logged structurally
      }
    } finally {
      setSubmitting(false);
      setSubmitStepLabel('');
    }
  };

  if (loadingJob) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="mb-3 text-xs font-medium text-[#78716C]">Loading application form...</p>
        <div className="h-80 rounded-2xl border border-[#E7E5E4] bg-white" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[#DC1F26]" />
        <h1 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
          Job Circular Not Found
        </h1>
        <p className="font-bn mt-1 text-xs text-[#78716C]">নিয়োগ বিজ্ঞপ্তি পাওয়া যায়নি</p>
        <p className="mt-2 text-sm text-[#57534E]">
          This application link is currently inactive or closed.
        </p>
        <Link
          to="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>View Active Openings</span>
        </Link>
      </div>
    );
  }

  const winState = getJobWindowState(job);
  const titlePair = resolveBilingualPair(job.titleEn, job.title);
  const catInfo = getJobCategoryDisplay(job.category);

  if (submittedCode) {
    return (
      <div className="bg-[#FAFAF8] px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-7 text-center sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display mt-4 text-2xl font-bold text-[#1C1917] sm:text-3xl">
              Application Submitted Successfully!
            </h1>
            <p className="font-bn mt-1 text-xs text-[#78716C]">
              আপনার আবেদন সফলভাবে গৃহীত হয়েছে
            </p>
            <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-[#44403C]">
              Your application for <strong className="text-[#1C1917]">{titlePair.primary}</strong>{' '}
              has been received. Once reviewed, exam or interview schedules can be checked anytime
              using your Application ID and mobile number.
            </p>

            <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <p className="text-xs font-semibold text-[#78716C]">Your Application ID</p>
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="font-mono text-xl font-bold tracking-wider text-[#DC1F26] sm:text-2xl">
                  {submittedCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(submittedCode);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  aria-label="Copy Application ID"
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#D6D3D1] bg-white text-[#1C1917] hover:border-[#DC1F26]"
                >
                  {copiedCode ? (
                    <Check className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[#57534E]">
                Please save this Application ID to check status updates later.
              </p>
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to={`/application-status?id=${encodeURIComponent(
                  submittedCode
                )}&mobile=${encodeURIComponent(submittedMobile)}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#DC1F26] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                Track Application Status
              </Link>
              <Link
                to="/jobs"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#D6D3D1] bg-white px-6 py-2.5 text-sm font-semibold text-[#1C1917] hover:border-[#1C1917]"
              >
                Browse Other Openings
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#1C1917] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#44403C]"
              >
                Back to Home
              </Link>
            </div>
          </div>

          <ApplicationStatusTracker
            initialCode={submittedCode}
            initialMobile={submittedMobile}
          />
        </div>
      </div>
    );
  }

  if (winState !== 'open') {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
        <h1 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
          {getJobWindowLabelEn(winState)}
        </h1>
        <p className="mt-2 text-sm text-[#57534E]">
          {winState === 'upcoming'
            ? `Applications for this position open on ${formatRecruitmentDateEn(job.startDate)}.`
            : `The application deadline (${formatRecruitmentDateEn(job.deadline)}) has passed.`}
        </p>
        <Link
          to={`/jobs/${job.slug}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Circular</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFAF8] pb-16 pt-6 sm:pt-10">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Link
          to={`/jobs/${job.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#57534E] hover:text-[#DC1F26]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Job Circular</span>
        </Link>

        {/* Form Header & Completion Progress */}
        <div className="mt-4 rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md border border-[#E7E5E4] bg-[#FAFAF8] px-2.5 py-1 text-[11px] font-semibold text-[#57534E]">
              {job.department ? `${job.department} · ${catInfo.en}` : catInfo.en}
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-[#57534E]">
              Completion: {progressSummary.percent}%
            </span>
          </div>
          <h1 className="font-display mt-2.5 text-2xl font-bold text-[#1C1917] sm:text-3xl">
            Application Form — {titlePair.primary}
          </h1>
          {titlePair.secondaryBn && (
            <p className="font-bn mt-0.5 text-xs text-[#78716C]">{titlePair.secondaryBn}</p>
          )}
          <p className="mt-1.5 text-xs tabular-nums text-[#57534E] sm:text-sm">
            Location: {job.workplace} · Deadline: {formatRecruitmentDateEn(job.deadline)}
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F4F0]">
            <div
              className="h-full rounded-full bg-[#DC1F26] transition-all duration-300"
              style={{ width: `${progressSummary.percent}%` }}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-6">
          {errorMsg && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs font-semibold text-red-800 sm:text-sm">
              {errorMsg}
            </div>
          )}

          {/* Section A: Personal Information */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                A. Personal Information
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">ব্যক্তিগত তথ্য</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Full Name (as per NID) <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full legal name"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Father&apos;s Name
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Father's full name"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Mother&apos;s Name
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="Mother's full name"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Date of Birth <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Gender <span className="text-[#DC1F26]">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                >
                  <option value="পুরুষ">Male (পুরুষ)</option>
                  <option value="নারী">Female (নারী)</option>
                  <option value="অন্যান্য">Other (অন্যান্য)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Marital Status
                </label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                >
                  <option value="অবিবাহিত">Unmarried (অবিবাহিত)</option>
                  <option value="বিবাহিত">Married (বিবাহিত)</option>
                  <option value="অন্যান্য">Other (অন্যান্য)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Nationality
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="Bangladeshi"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  National ID (NID) / Birth Registration No. <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={nidNumber}
                  onChange={(e) => setNidNumber(e.target.value)}
                  placeholder="10, 13, or 17 digit NID number"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Passport Number (Optional)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder="If available"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section B: Contact Information */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                B. Contact Information
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">যোগাযোগের তথ্য</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Mobile Number <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={20}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Alternative Mobile (Optional)
                </label>
                <input
                  type="tel"
                  maxLength={20}
                  value={alternativeMobile}
                  onChange={(e) => setAlternativeMobile(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Present Address <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={400}
                  value={presentAddress}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPresentAddress(val);
                    if (sameAsPresent) setPermanentAddress(val);
                  }}
                  placeholder="House/Road, Area, Thana, District"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#1C1917]">
                    Permanent Address
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#57534E]">
                    <input
                      type="checkbox"
                      checked={sameAsPresent}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameAsPresent(checked);
                        if (checked) setPermanentAddress(presentAddress);
                      }}
                      className="h-3.5 w-3.5 rounded border-[#D6D3D1] text-[#DC1F26]"
                    />
                    <span>Same as present address</span>
                  </label>
                </div>
                <input
                  type="text"
                  maxLength={400}
                  disabled={sameAsPresent}
                  value={sameAsPresent ? presentAddress : permanentAddress}
                  onChange={(e) => setPermanentAddress(e.target.value)}
                  placeholder="Enter permanent address"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none disabled:opacity-75"
                />
              </div>
            </div>
          </section>

          {/* Section C: Educational Qualification */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                C. Educational Qualification
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">শিক্ষাগত যোগ্যতা</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Highest Qualification <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                  placeholder="e.g. SSC / HSC / Diploma / Bachelor's"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Subject / Department
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={subjectDepartment}
                  onChange={(e) => setSubjectDepartment(e.target.value)}
                  placeholder="e.g. Science / Commerce / Accounting"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Institution Name
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="School / College / University"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                    Passing Year
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={passingYear}
                    onChange={(e) => setPassingYear(e.target.value)}
                    placeholder="e.g. 2022"
                    className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                    Result / GPA
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={resultGpa}
                    onChange={(e) => setResultGpa(e.target.value)}
                    placeholder="GPA 4.50"
                    className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Section D: Experience & Position */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                D. Position &amp; Experience
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">চাকরি ও অভিজ্ঞতা</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Position Applied For <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={appliedPosition}
                  onChange={(e) => setAppliedPosition(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm font-semibold text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-semibold text-[#1C1917]">
                  <input
                    type="checkbox"
                    checked={hasPreviousExperience}
                    onChange={(e) => setHasPreviousExperience(e.target.checked)}
                    className="h-4 w-4 rounded border-[#D6D3D1] text-[#DC1F26]"
                  />
                  <span>I have prior work experience</span>
                </label>
              </div>

              {hasPreviousExperience && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                      Years of Experience
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="e.g. 2 years"
                      className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                      Previous Organization &amp; Role
                    </label>
                    <input
                      type="text"
                      maxLength={160}
                      value={previousOrganization}
                      onChange={(e) => setPreviousOrganization(e.target.value)}
                      placeholder="Company name & designation"
                      className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Current Occupation
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={currentOccupation}
                  onChange={(e) => setCurrentOccupation(e.target.value)}
                  placeholder="e.g. Student / Employed / Self-employed"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Expected Salary (BDT)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={expectedSalary}
                  onChange={(e) => setExpectedSalary(e.target.value)}
                  placeholder="e.g. 18,000 BDT or Negotiable"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section E: Skills & Additional Information */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                E. Skills &amp; Additional Information
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">দক্ষতা ও অতিরিক্ত তথ্য</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Computer Skills
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={computerSkills}
                  onChange={(e) => setComputerSkills(e.target.value)}
                  placeholder="e.g. MS Word, Excel, POS Billing"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Language Proficiency
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={languageSkills}
                  onChange={(e) => setLanguageSkills(e.target.value)}
                  placeholder="e.g. Bengali, English"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Other Practical Skills
                </label>
                <input
                  type="text"
                  maxLength={600}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. Customer Service, Inventory Handling, Driving Licence"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Brief Introduction About Yourself
                </label>
                <textarea
                  rows={3}
                  maxLength={1500}
                  value={aboutSelf}
                  onChange={(e) => setAboutSelf(e.target.value)}
                  placeholder="Share why you are a good fit and what excites you about working with Home Recipe Foods..."
                  className="w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Reference (Optional)
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={referenceInfo}
                  onChange={(e) => setReferenceInfo(e.target.value)}
                  placeholder="Name & phone number of a reference"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Portfolio Link or Extra Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={cvUrlOrNote}
                  onChange={(e) => setCvUrlOrNote(e.target.value)}
                  placeholder="Any external link or additional note"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section F: Photo & Documents Upload */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                F. Photo &amp; Supporting Documents
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">ছবি ও ডকুমেন্ট আপলোড</p>
            </div>
            <p className="mt-2.5 text-xs text-[#57534E]">
              Candidate photo must be under 2 MB (JPG / JPEG / PNG). Supporting documents may be up
              to 5 MB each (PDF / DOC / DOCX / JPG / PNG).
            </p>

            <div className="mt-4 space-y-4">
              {/* Candidate Photo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  Passport-Size Candidate Photo <span className="text-[#DC1F26]">*</span>{' '}
                  <span className="font-normal text-[#78716C]">(JPG / PNG, max 2 MB)</span>
                </label>
                {photoPreviewUrl && photoFile ? (
                  <div className="flex items-center gap-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3">
                    <div className="relative overflow-hidden rounded-lg border border-[#D6D3D1]">
                      <img
                        src={photoPreviewUrl}
                        alt="Applicant preview"
                        className="h-24 w-24 object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate font-semibold text-[#1C1917]">{photoFile.name}</p>
                      <p className="font-mono tabular-nums text-[#78716C]">
                        {(photoFile.size / 1024).toFixed(0)} KB
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setPhotoFile(null);
                          setPhotoPreviewUrl('');
                        }}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3" />
                        <span>Replace Photo</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex min-h-[72px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#D6D3D1] bg-[#FAFAF8] px-4 py-4 text-xs font-medium text-[#57534E] transition-colors hover:border-[#DC1F26] hover:text-[#1C1917]">
                    <Upload className="h-4 w-4 text-[#DC1F26]" />
                    <span>Select Passport-Size Photo (Required)</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Supporting Documents */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DocUploadField
                  label="NID / Birth Certificate Copy"
                  hint="PDF, DOC, JPG, or PNG (max 5 MB)"
                  file={nidFile}
                  onClear={() => setNidFile(null)}
                  onChange={(e) => handleDocFileChange(setNidFile, e)}
                />
                <DocUploadField
                  label="CV / Resume"
                  hint="PDF, DOC, DOCX, JPG, or PNG (max 5 MB)"
                  file={cvFile}
                  onClear={() => setCvFile(null)}
                  onChange={(e) => handleDocFileChange(setCvFile, e)}
                />
                <DocUploadField
                  label="Educational Certificate"
                  hint="PDF, DOC, JPG, or PNG (max 5 MB)"
                  file={eduFile}
                  onClear={() => setEduFile(null)}
                  onChange={(e) => handleDocFileChange(setEduFile, e)}
                />
                <DocUploadField
                  label="Other Document (Optional)"
                  hint="Experience letter, driving licence, etc."
                  file={otherFile}
                  onClear={() => setOtherFile(null)}
                  onChange={(e) => handleDocFileChange(setOtherFile, e)}
                />
              </div>
            </div>
          </section>

          {/* Section G: Declaration & Submit */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <div className="border-b border-[#F5F4F0] pb-3">
              <h2 className="font-display text-lg font-bold text-[#1C1917] sm:text-xl">
                G. Declaration &amp; Submit
              </h2>
              <p className="font-bn text-[11px] text-[#78716C]">ঘোষণা ও জমা</p>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 text-xs leading-relaxed text-[#1C1917] sm:text-sm">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#D6D3D1] text-[#DC1F26]"
              />
              <span>
                I declare that all information and uploaded documents provided above are true and
                accurate. Any misrepresentation may result in cancellation of my application.{' '}
                <span className="text-[#DC1F26]">*</span>
              </span>
            </label>

            <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-[#57534E]">
                {submitStepLabel ||
                  'Please review your entries carefully and click Submit Application.'}
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full cursor-pointer rounded-xl bg-[#DC1F26] px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-60 sm:w-auto"
              >
                {submitting ? submitStepLabel || 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

function DocUploadField({
  label,
  hint,
  file,
  onClear,
  onChange,
}: {
  label: string;
  hint: string;
  file: File | null;
  onClear: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-3.5">
      <p className="text-xs font-semibold text-[#1C1917]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[#78716C]">{hint}</p>
      {file ? (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[#1C1917]">
            <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
            <span className="truncate">{file.name}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove file"
            className="shrink-0 cursor-pointer rounded p-1 text-[#78716C] hover:bg-red-50 hover:text-red-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="mt-2.5 flex min-h-[42px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#D6D3D1] bg-white px-3 py-2 text-xs font-semibold text-[#57534E] transition-colors hover:border-[#DC1F26] hover:text-[#1C1917]">
          <Upload className="h-3.5 w-3.5 text-[#DC1F26]" />
          <span>Choose File</span>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
