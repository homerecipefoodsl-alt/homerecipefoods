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
import {
  OperationType,
  db,
  handleFirestoreError,
} from '../lib/firebase';
import {
  computeJobApplicationLock,
  computeMobileVerificationHash,
  formatRecruitmentDateBn,
  getJobWindowLabelBn,
  getJobWindowState,
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
import { getDynamicBengaliDate, toBengaliDigits } from '../lib/utils';
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
  const [nationality, setNationality] = useState('বাংলাদেশি');
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
  const [languageSkills, setLanguageSkills] = useState('বাংলা (মাতৃভাষা), ইংরেজি');
  const [skills, setSkills] = useState('');
  const [aboutSelf, setAboutSelf] = useState('');
  const [referenceInfo, setReferenceInfo] = useState('');
  const [cvUrlOrNote, setCvUrlOrNote] = useState('');

  // Section F: Photo & Documents (Firebase Storage)
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
          setAppliedPosition(foundJob.title);
          document.title = `আবেদন ফর্ম: ${foundJob.title} – Home Recipe Foods`;
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
      setErrorMsg('ডাটাবেস সংযোগ এই মুহূর্তে সক্রিয় নয়। একটু পর আবার চেষ্টা করুন।');
      return;
    }
    const activeDb = db;

    if (!job || getJobWindowState(job) !== 'open') {
      setErrorMsg('এই পদের জন্য আবেদন বর্তমানে চালু নেই।');
      return;
    }

    if (fullName.trim().length < 2) {
      setErrorMsg('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
      return;
    }
    if (!dateOfBirth.trim()) {
      setErrorMsg('অনুগ্রহ করে জন্ম তারিখ নির্বাচন করুন।');
      return;
    }
    const cleanNid = normalizeNidNumber(nidNumber);
    if (cleanNid.length < 8) {
      setErrorMsg('সঠিক জাতীয় পরিচয়পত্র (NID) বা জন্ম নিবন্ধন নম্বর লিখুন।');
      return;
    }
    if (!isValidBdMobile(mobile)) {
      setErrorMsg('সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।');
      return;
    }
    if (alternativeMobile.trim() && !isValidBdMobile(alternativeMobile)) {
      setErrorMsg('বিকল্প মোবাইল নম্বর দিলে অবশ্যই সঠিক ১১ সংখ্যার বাংলাদেশি নম্বর দিন।');
      return;
    }
    if (!isValidOptionalEmail(email)) {
      setErrorMsg('অনুগ্রহ করে সঠিক ইমেইল ঠিকানা লিখুন অথবা ঘরটি খালি রাখুন।');
      return;
    }
    if (presentAddress.trim().length < 3) {
      setErrorMsg('অনুগ্রহ করে আপনার বর্তমান ঠিকানা লিখুন।');
      return;
    }
    if (!educationLevel.trim()) {
      setErrorMsg('অনুগ্রহ করে আপনার সর্বশেষ শিক্ষাগত যোগ্যতা নির্বাচন বা লিখুন।');
      return;
    }
    if (!appliedPosition.trim()) {
      setErrorMsg('কোন পদে আবেদন করছেন তা নির্ধারণ করুন।');
      return;
    }
    if (!photoFile) {
      setErrorMsg('অনুগ্রহ করে প্রার্থীর পাসপোর্ট সাইজ ছবি আপলোড করুন (JPG/PNG, সর্বোচ্চ 2MB)।');
      return;
    }
    if (!declarationAccepted) {
      setErrorMsg('আবেদন জমা দেওয়ার আগে ঘোষণা (Declaration) বক্সে টিক চিহ্ন দিন।');
      return;
    }

    setSubmitting(true);
    setSubmitStepLabel('তথ্য যাচাই করা হচ্ছে...');

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
        setErrorMsg(
          'এই মোবাইল নম্বর দিয়ে এই পদের জন্য ইতিমধ্যে একটি আবেদন জমা দেওয়া হয়েছে।'
        );
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
          'এই NID / জন্ম নিবন্ধন নম্বর দিয়ে এই পদের জন্য ইতিমধ্যে একটি আবেদন জমা দেওয়া হয়েছে।'
        );
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      // Step 1: Reserve deterministic SN-JOB-YYYY-00001 application ID
      setSubmitStepLabel('আবেদন নম্বর তৈরি হচ্ছে...');
      const applicationCode = await reserveNextApplicationId(activeDb);

      // Step 2: Upload Photo & Documents (fail-fast before Firestore commit)
      setSubmitStepLabel('ছবি ও ডকুমেন্ট আপলোড হচ্ছে...');
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
        setErrorMsg('ডকুমেন্ট আপলোড হয়নি। আবার চেষ্টা করুন।');
        setSubmitting(false);
        setSubmitStepLabel('');
        return;
      }

      // Step 3: Commit Firestore documents atomically
      setSubmitStepLabel('আবেদন সংরক্ষণ করা হচ্ছে...');
      const mobileHash = await computeMobileVerificationHash(cleanMobile);
      const submittedDateText = getDynamicBengaliDate().replace(/^আজ\s+/, '');
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
        nationality: (nationality.trim() || 'বাংলাদেশি').slice(0, 60),
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
            note: 'অনলাইন পোর্টাল থেকে আবেদন জমা দেওয়া হয়েছে।',
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
            'একই মোবাইল নম্বর বা NID দিয়ে ইতিমধ্যে এই পদের জন্য আবেদন করা হয়েছে।'
          );
        } else {
          setErrorMsg(
            'আবেদন সংরক্ষণ করা যায়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
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
        'আবেদন সংরক্ষণ করা যায়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
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
        <div className="h-96 animate-pulse rounded-2xl border border-[#E7E5E4] bg-white" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[#DC1F26]" />
        <h1 className="font-display mt-3 text-2xl font-bold text-[#1C1917]">
          নিয়োগ বিজ্ঞপ্তি পাওয়া যায়নি
        </h1>
        <p className="mt-2 text-sm text-[#57534E]">
          এই পদের আবেদন লিংকটি বর্তমানে সক্রিয় নয়।
        </p>
        <Link
          to="/jobs"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>চলমান নিয়োগ বিজ্ঞপ্তি দেখুন</span>
        </Link>
      </div>
    );
  }

  const winState = getJobWindowState(job);

  if (submittedCode) {
    return (
      <div className="bg-[#FAFAF8] px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="rounded-2xl border border-[#E7E5E4] bg-white p-7 text-center sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="font-display mt-4 text-2xl font-bold text-[#1C1917] sm:text-3xl">
              আপনার আবেদন সফলভাবে গৃহীত হয়েছে!
            </h1>
            <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-[#44403C]">
              আপনার আবেদনটি <strong className="text-[#1C1917]">{job.title}</strong> পদের জন্য জমা হয়েছে। যাচাই-বাছাই শেষে পরবর্তী পরীক্ষা বা সাক্ষাৎকারের তথ্য নিচের Application ID এবং আপনার মোবাইল নম্বর দিয়ে জানতে পারবেন।
            </p>

            <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-[#E7E5E4] bg-[#FAFAF8] p-4">
              <p className="text-xs font-semibold text-[#78716C]">
                আপনার আবেদন নম্বর (Application ID)
              </p>
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
                ভবিষ্যতে আবেদনের অবস্থা দেখতে এই Application ID সংরক্ষণ করে রাখুন।
              </p>
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to={`/application-status?id=${encodeURIComponent(
                  submittedCode
                )}&mobile=${encodeURIComponent(submittedMobile)}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#DC1F26] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                আবেদনের অবস্থা দেখুন
              </Link>
              <Link
                to="/jobs"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#D6D3D1] bg-white px-6 py-2.5 text-sm font-semibold text-[#1C1917] hover:border-[#1C1917]"
              >
                অন্যান্য নিয়োগ দেখুন
              </Link>
              <Link
                to="/"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#1C1917] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#44403C]"
              >
                হোমে ফিরে যান
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
          {getJobWindowLabelBn(winState)}
        </h1>
        <p className="mt-2 text-sm text-[#57534E]">
          {winState === 'upcoming'
            ? `এই পদের আবেদন শুরু হবে ${formatRecruitmentDateBn(job.startDate)} তারিখে।`
            : `এই পদের আবেদনের শেষ তারিখ (${formatRecruitmentDateBn(job.deadline)}) অতিক্রম করেছে।`}
        </p>
        <Link
          to={`/jobs/${job.slug}`}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1C1917] px-5 py-3 text-sm font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>বিজ্ঞপ্তিতে ফিরে যান</span>
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
          <span>বিজ্ঞপ্তিতে ফিরে যান</span>
        </Link>

        {/* Form Header & Completion Progress */}
        <div className="mt-4 rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md border border-[#FDE047] bg-[#FEFCE8] px-2.5 py-1 text-[11px] font-bold text-[#9A3412]">
              {job.department ? `${job.department} · ${job.category}` : job.category}
            </span>
            <span className="font-mono text-xs font-semibold text-[#57534E] tabular-nums">
              ফর্ম অগ্রগতি: {toBengaliDigits(progressSummary.percent)}%
            </span>
          </div>
          <h1 className="font-display mt-2.5 text-2xl font-bold text-[#1C1917] sm:text-3xl">
            চাকরির আবেদন ফর্ম — {job.title}
          </h1>
          <p className="mt-1 text-xs text-[#57534E] sm:text-sm">
            কর্মস্থল: {job.workplace} · শেষ তারিখ: {formatRecruitmentDateBn(job.deadline)}
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
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              A. ব্যক্তিগত তথ্য (Personal Information)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  পূর্ণ নাম <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="জাতীয় পরিচয়পত্র অনুযায়ী আপনার পূর্ণ নাম"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  পিতার নাম
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="পিতার পূর্ণ নাম"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  মাতার নাম
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={motherName}
                  onChange={(e) => setMotherName(e.target.value)}
                  placeholder="মাতার পূর্ণ নাম"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  জন্ম তারিখ <span className="text-[#DC1F26]">*</span>
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
                  লিঙ্গ <span className="text-[#DC1F26]">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                >
                  <option value="পুরুষ">পুরুষ (Male)</option>
                  <option value="নারী">নারী (Female)</option>
                  <option value="অন্যান্য">অন্যান্য (Other)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  বৈবাহিক অবস্থা
                </label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                >
                  <option value="অবিবাহিত">অবিবাহিত (Unmarried)</option>
                  <option value="বিবাহিত">বিবাহিত (Married)</option>
                  <option value="অন্যান্য">অন্যান্য</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  জাতীয়তা
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder="বাংলাদেশি"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  জাতীয় পরিচয়পত্র (NID) / জন্ম নিবন্ধন নম্বর <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={nidNumber}
                  onChange={(e) => setNidNumber(e.target.value)}
                  placeholder="১০ / ১৩ / ১৭ সংখ্যার NID নম্বর"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  পাসপোর্ট নম্বর (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder="যদি থাকে"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section B: Contact Information */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              B. যোগাযোগের তথ্য (Contact Information)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  মোবাইল নম্বর <span className="text-[#DC1F26]">*</span>
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
                  বিকল্প মোবাইল নম্বর (ঐচ্ছিক)
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
                  ইমেইল ঠিকানা (ঐচ্ছিক)
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
                  বর্তমান ঠিকানা <span className="text-[#DC1F26]">*</span>
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
                  placeholder="বাসা/গ্রাম, ডাকঘর, থানা, জেলা"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#1C1917]">
                    স্থায়ী ঠিকানা
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
                    <span>বর্তমান ঠিকানার মতোই</span>
                  </label>
                </div>
                <input
                  type="text"
                  maxLength={400}
                  disabled={sameAsPresent}
                  value={sameAsPresent ? presentAddress : permanentAddress}
                  onChange={(e) => setPermanentAddress(e.target.value)}
                  placeholder="স্থায়ী ঠিকানা লিখুন"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none disabled:opacity-75"
                />
              </div>
            </div>
          </section>

          {/* Section C: Educational Qualification */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              C. শিক্ষাগত যোগ্যতা (Educational Qualification)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  সর্বশেষ শিক্ষাগত যোগ্যতা <span className="text-[#DC1F26]">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                  placeholder="যেমন: অষ্টম শ্রেণি / এসএসসি / এইচএসসি / স্নাতক"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  বিষয় / বিভাগ (Subject / Department)
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={subjectDepartment}
                  onChange={(e) => setSubjectDepartment(e.target.value)}
                  placeholder="যেমন: বিজ্ঞান / ব্যবসায় শিক্ষা / মানবিক / হিসাববিজ্ঞান"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  শিক্ষা প্রতিষ্ঠানের নাম
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="স্কুল / কলেজ / বিশ্ববিদ্যালয়"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                    পাশের সাল
                  </label>
                  <input
                    type="text"
                    maxLength={20}
                    value={passingYear}
                    onChange={(e) => setPassingYear(e.target.value)}
                    placeholder="যেমন: ২০২২"
                    className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                    ফলাফল / GPA
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
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              D. চাকরি ও অভিজ্ঞতা (Experience &amp; Job Info)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  কোন পদে আবেদন করছেন <span className="text-[#DC1F26]">*</span>
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
                  <span>আমার পূর্বের চাকরির অভিজ্ঞতা রয়েছে</span>
                </label>
              </div>

              {hasPreviousExperience && (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                      কত বছরের অভিজ্ঞতা
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={experienceYears}
                      onChange={(e) => setExperienceYears(e.target.value)}
                      placeholder="যেমন: ২ বছর"
                      className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                      পূর্বের প্রতিষ্ঠানের নাম
                    </label>
                    <input
                      type="text"
                      maxLength={160}
                      value={previousOrganization}
                      onChange={(e) => setPreviousOrganization(e.target.value)}
                      placeholder="প্রতিষ্ঠানের নাম ও পদবি"
                      className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  বর্তমান পেশা
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={currentOccupation}
                  onChange={(e) => setCurrentOccupation(e.target.value)}
                  placeholder="যেমন: ছাত্র / চাকরিজীবী / ফ্রিল্যান্সার"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  প্রত্যাশিত বেতন
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={expectedSalary}
                  onChange={(e) => setExpectedSalary(e.target.value)}
                  placeholder="যেমন: ১৮,০০০ টাকা বা আলোচনা সাপেক্ষে"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section E: Skills & Additional Information */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              E. দক্ষতা ও অতিরিক্ত তথ্য (Skills &amp; Additional Info)
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  কম্পিউটার দক্ষতা (Computer Skills)
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={computerSkills}
                  onChange={(e) => setComputerSkills(e.target.value)}
                  placeholder="যেমন: MS Word, Excel, Billing Software"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  ভাষাগত দক্ষতা (Language Skills)
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={languageSkills}
                  onChange={(e) => setLanguageSkills(e.target.value)}
                  placeholder="যেমন: বাংলা, ইংরেজি"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  অন্যান্য দক্ষতা (Skills)
                </label>
                <input
                  type="text"
                  maxLength={600}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="যেমন: কাস্টমার হ্যান্ডলিং, হিসাবরক্ষণ, ড্রাইভিং লাইসেন্স"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  নিজের সম্পর্কে সংক্ষিপ্ত বিবরণ
                </label>
                <textarea
                  rows={3}
                  maxLength={1500}
                  value={aboutSelf}
                  onChange={(e) => setAboutSelf(e.target.value)}
                  placeholder="আপনি কেন এই পদের জন্য যোগ্য এবং কাজের আগ্রহ সম্পর্কে সংক্ষেপে লিখুন..."
                  className="w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  রেফারেন্স তথ্য (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={referenceInfo}
                  onChange={(e) => setReferenceInfo(e.target.value)}
                  placeholder="পরিচিত কারও নাম ও ফোন নম্বর"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  অতিরিক্ত নোট / পোর্টফোলিও লিংক (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={cvUrlOrNote}
                  onChange={(e) => setCvUrlOrNote(e.target.value)}
                  placeholder="অতিরিক্ত কোনো লিংক বা তথ্য"
                  className="min-h-[44px] w-full rounded-xl border border-[#D6D3D1] bg-[#FAFAF8] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#DC1F26] focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section F: Photo & Documents Upload */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              F. ছবি ও ডকুমেন্ট আপলোড (Photo &amp; Documents)
            </h2>
            <p className="mt-2 text-xs text-[#57534E]">
              ছবি সর্বোচ্চ 2MB (JPG / JPEG / PNG) এবং প্রতিটি ডকুমেন্ট সর্বোচ্চ 5MB (PDF / DOC / DOCX / JPG / PNG) হতে পারবে।
            </p>

            <div className="mt-4 space-y-4">
              {/* Candidate Photo */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                  প্রার্থীর পাসপোর্ট সাইজ ছবি <span className="text-[#DC1F26]">*</span>{' '}
                  <span className="font-normal text-[#78716C]">(JPG / PNG, সর্বোচ্চ 2MB)</span>
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
                      <p className="font-mono text-[#78716C]">
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
                        <span>পরিবর্তন করুন</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex min-h-[72px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#D6D3D1] bg-[#FAFAF8] px-4 py-4 text-xs font-medium text-[#57534E] transition-colors hover:border-[#DC1F26] hover:text-[#1C1917]">
                    <Upload className="h-4 w-4 text-[#DC1F26]" />
                    <span>পাসপোর্ট সাইজ ছবি নির্বাচন করুন (আবশ্যক)</span>
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
                  label="NID / জন্ম নিবন্ধন কপি"
                  hint="PDF, DOC, JPG বা PNG (সর্বোচ্চ 5MB)"
                  file={nidFile}
                  onClear={() => setNidFile(null)}
                  onChange={(e) => handleDocFileChange(setNidFile, e)}
                />
                <DocUploadField
                  label="CV / জীবনবৃত্তান্ত (Resume)"
                  hint="PDF, DOC, DOCX, JPG বা PNG (সর্বোচ্চ 5MB)"
                  file={cvFile}
                  onClear={() => setCvFile(null)}
                  onChange={(e) => handleDocFileChange(setCvFile, e)}
                />
                <DocUploadField
                  label="শিক্ষাগত সনদপত্র (Certificate)"
                  hint="PDF, DOC, JPG বা PNG (সর্বোচ্চ 5MB)"
                  file={eduFile}
                  onClear={() => setEduFile(null)}
                  onChange={(e) => handleDocFileChange(setEduFile, e)}
                />
                <DocUploadField
                  label="অন্যান্য ডকুমেন্ট (ঐচ্ছিক)"
                  hint="অভিজ্ঞতা / ড্রাইভিং লাইসেন্স ইত্যাদি"
                  file={otherFile}
                  onClear={() => setOtherFile(null)}
                  onChange={(e) => handleDocFileChange(setOtherFile, e)}
                />
              </div>
            </div>
          </section>

          {/* Section G: Declaration & Submit */}
          <section className="rounded-2xl border border-[#E7E5E4] bg-white p-5 sm:p-7">
            <h2 className="font-display border-b border-[#F5F4F0] pb-3 text-lg font-bold text-[#1C1917] sm:text-xl">
              G. ঘোষণা ও জমা (Declaration &amp; Submit)
            </h2>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#E7E5E4] bg-[#FAFAF8] p-4 text-xs leading-relaxed text-[#1C1917] sm:text-sm">
              <input
                type="checkbox"
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#D6D3D1] text-[#DC1F26]"
              />
              <span>
                আমি ঘোষণা করছি যে উপরের প্রদত্ত সকল তথ্য ও সংযুক্ত কাগজপত্র সম্পূর্ণ সত্য ও নির্ভুল। কোনো তথ্য মিথ্যা বা অসত্য প্রমাণিত হলে আমার আবেদন বাতিল বলে গণ্য হবে।{' '}
                <span className="text-[#DC1F26]">*</span>
              </span>
            </label>

            <div className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-[#57534E]">
                {submitStepLabel || 'সঠিক তথ্য যাচাই করে নিচের বাটনে ক্লিক করে আবেদন সম্পন্ন করুন।'}
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full cursor-pointer rounded-xl bg-[#DC1F26] px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-[#B91C1C] disabled:opacity-60 sm:w-auto"
              >
                {submitting ? submitStepLabel || 'আবেদন জমা হচ্ছে...' : 'আবেদন জমা দিন'}
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
          <span>ফাইল নির্বাচন করুন</span>
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
