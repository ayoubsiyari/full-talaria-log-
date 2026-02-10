import React, { useState, useEffect } from 'react';
import { Mail, Users, Send, CheckCircle, AlertCircle, Search, Eye, EyeOff, RotateCcw, X, FileText, ChevronDown } from 'lucide-react';

// Email Templates Library
const EMAIL_TEMPLATES = [
  {
    id: 'mentorship-acceptance',
    name: '🎉 Mentorship Acceptance (Arabic)',
    subject: 'تهانينا! تم قبول طلبك للانضمام إلى برنامج المنتورشيب',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5; direction: rtl;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; direction: rtl; text-align: right;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 24px; margin: 20px 0 0 0; font-weight: 700;">🎉 تهانينا!</h1>
                            <p style="color: #ffffff; font-size: 14px; margin: 10px 0 0 0;">تم قبول طلبك للانضمام</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px; direction: rtl; text-align: right;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                <tr>
                                    <td style="background-color: #e8f4fd; border-right: 4px solid #1e3a5f; padding: 15px; border-radius: 6px;">
                                        <p style="color: #000000; font-size: 14px; margin: 0; line-height: 1.6;">⚠️ لضمان مكانك في المنتورشيب يرجى اتباع الخطوات التالية:</p>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                <tr>
                                    <td style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
                                        <h3 style="color: #1e3a5f; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">📋 قبل البدء</h3>
                                        <ul style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; padding-right: 20px; padding-left: 0;">
                                            <li>يرجى سداد رسوم المنتورشيب <strong>خلال سبعة أيام</strong> من استلام هذه الرسالة، وإلا سيتم إلغاء الحجز.</li>
                                            <li>الرسوم <strong>غير قابلة للاسترداد</strong> إلا في حالة إلغاء المنتورشيب.</li>
                                            <li>تبدأ الدروس الساعة <strong>9 مساءً بتوقيت مكة المكرمة</strong> من الاثنين إلى الجمعة.</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                <tr>
                                    <td style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
                                        <h3 style="color: #1e3a5f; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">1️⃣ التواصل عبر ديسكورد</h3>
                                        <p style="color: #000000; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">التواصل في المنتورشيب يتم عبر تطبيق <strong>ديسكورد</strong></p>
                                        <ul style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; padding-right: 20px; padding-left: 0;">
                                            <li>إذا كان لديك حساب ديسكورد، أرسل اسم المستخدم الخاص بك.</li>
                                            <li>إذا لم يكن لديك حساب، قم بتحميل البرنامج من <a href="https://discord.com" style="color: #1e3a5f; font-weight: 600;">discord.com</a></li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                <tr>
                                    <td style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
                                        <h3 style="color: #1e3a5f; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">2️⃣ إتمام عملية الدفع</h3>
                                        <p style="color: #000000; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">⚠️ يرجى التأكد من عنوان محفظة الدفع والشبكة المستخدمة جيدًا.</p>
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px;">
                                            <tr><td style="padding: 12px; border-bottom: 1px solid #e0e0e0;"><span style="color: #000000; font-size: 14px;">طريقة الدفع: <strong>الكريبتو</strong></span></td></tr>
                                            <tr><td style="padding: 12px; border-bottom: 1px solid #e0e0e0;"><span style="color: #000000; font-size: 14px;">نوع العملة: <strong>USDC أو USDT</strong></span></td></tr>
                                            <tr><td style="padding: 12px; border-bottom: 1px solid #e0e0e0;"><span style="color: #000000; font-size: 14px;">المبلغ: <strong style="color: #1e3a5f;">$700</strong></span></td></tr>
                                            <tr><td style="padding: 12px; border-bottom: 1px solid #e0e0e0;"><span style="color: #000000; font-size: 14px;">الشبكة: <strong>BEP20</strong></span></td></tr>
                                            <tr>
                                                <td style="padding: 0;">
                                                    <p style="color: #000000; font-size: 12px; margin: 0 0 8px 0; padding: 0 12px;">عنوان المحفظة:</p>
                                                    <div style="background-color: #e8e8e8; padding: 12px 2px; text-align: center; margin: 0; width: 100%;">
                                                        <span style="font-size: 7px; color: #000000; font-family: Arial, sans-serif; letter-spacing: -0.3px;">0xe25D96504c2106a243dc93D948d19640Cf6F4800</span>
                                                    </div>
                                                    <p style="color: #cc0000; font-size: 11px; margin: 8px 0 12px 0; padding: 0 12px; text-align: center;">⚠️ تأكد من نسخ العنوان بشكل صحيح وكامل</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                <tr>
                                    <td style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
                                        <h3 style="color: #1e3a5f; font-size: 14px; margin: 0 0 12px 0; font-weight: 700;">3️⃣ عند إتمام الدفع</h3>
                                        <p style="color: #000000; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0;">عند قيامك باتمام عملية الدفع، قم بإرسال المعلومات أدناه لنا عبر بريدنا الالكتروني:<br><strong style="color: #1e3a5f;">support-center@talaria-log.com</strong><br>متضمناً:</p>
                                        <ul style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; padding-right: 20px; padding-left: 0;">
                                            <li><strong>1.</strong> اسم معرف الديسكورد (USER NAME)</li>
                                            <li><strong>2.</strong> كود عملية التحويل (TXID) - <strong>لن يتم قبول طلبك بدونه</strong></li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="background-color: #1e3a5f; border-radius: 8px; padding: 20px; text-align: center;">
                                        <p style="color: #ffffff; font-size: 14px; line-height: 1.6; margin: 0;">✅ بعد استلام المبلغ ستتلقى رسالة تأكيد،<br>تليها تفاصيل الدخول إلى سيرفر الديسكورد بين <strong>٣ و ٥ يوليو</strong></p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 25px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 14px; margin: 0 0 8px 0;">للاستفسارات، تواصل معنا عبر</p>
                            <a href="mailto:support-center@talaria-log.com" style="color: #1e3a5f; font-size: 14px; font-weight: 600;">support-center@talaria-log.com</a>
                            <p style="color: #000000; font-size: 14px; margin: 15px 0 0 0;">© 2026 Talaria-Log <br>جميع الحقوق محفوظة</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  },
  {
    id: 'payment-confirmation',
    name: '✅ Payment Confirmation (Arabic)',
    subject: 'تم استلام رسوم اشتراكك بنجاح',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 22px; margin: 15px 0 0 0;">✅ تم إستلام رسوم الإشتراك</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px; text-align: right;">
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">مرحباً</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">نود اعلامك بأننا استلمنا رسوم اشتراكك في منتورشيب 2026 بنجاح<br>شكراً لثقتك بنا</p>
                            <div style="background-color: #e8f4fd; border-right: 4px solid #1e3a5f; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                                <p style="color: #000000; font-size: 14px; margin: 0;">📌 ستتلقى تفاصيل الدخول إلى سيرفر الديسكورد بين ٣ و ٥ يوليو</p>
                            </div>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; text-align: right; direction: rtl;">للاستفسارات: <a href="mailto:support-center@talaria-log.com" style="color: #1e3a5f;">support-center@talaria-log.com</a></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 12px; margin: 0;">© 2026 Talaria-Log<br>جميع الحقوق محفوظة</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  },
  {
    id: 'discord-access',
    name: '🎮 Discord Access (Arabic)',
    subject: 'تفاصيل الدخول إلى سيرفر الديسكورد - Talaria Trading',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 22px; margin: 15px 0 0 0;">🎮 مرحباً بك في الديسكورد!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px; text-align: right;">
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">مرحباً،</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">يسعدنا إعلامك بأن سيرفر الديسكورد الخاص بالمنتورشيب جاهز الآن!</p>
                            <div style="background-color: #1e3a5f; padding: 25px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                                <p style="color: #ffffff; font-size: 14px; margin: 0 0 15px 0;">رابط الانضمام:</p>
                                <a href="[DISCORD_INVITE_LINK]" style="display: inline-block; background-color: #ffffff; color: #1e3a5f; padding: 12px 30px; border-radius: 6px; font-weight: 600; text-decoration: none;">انضم الآن</a>
                            </div>
                            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border: 1px solid #e0e0e0;">
                                <h3 style="color: #1e3a5f; font-size: 14px; margin: 0 0 10px 0;">📋 تعليمات مهمة:</h3>
                                <ul style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; padding-right: 20px;">
                                    <li>استخدم نفس اسم المستخدم الذي أرسلته لنا</li>
                                    <li>تأكد من تفعيل الإشعارات</li>
                                    <li>تواجد في الموعد المحدد للدروس</li>
                                </ul>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 12px; margin: 0;">© 2026 Talaria Trading</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  },
  {
    id: 'payment-reminder',
    name: '⏰ Payment Reminder (Arabic)',
    subject: 'تذكير: موعد الدفع يقترب - Talaria Trading',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 22px; margin: 15px 0 0 0;">⏰ تذكير بالدفع</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px; text-align: right;">
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">مرحباً،</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">نود تذكيرك بأن موعد سداد رسوم المنتورشيب يقترب. يرجى إتمام الدفع لضمان مكانك.</p>
                            <div style="background-color: #fff3cd; border-right: 4px solid #ffc107; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                                <p style="color: #856404; font-size: 14px; margin: 0;">⚠️ في حال عدم الدفع خلال المهلة المحددة، سيتم إلغاء حجزك تلقائياً.</p>
                            </div>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0; text-align: right; direction: rtl;">للاستفسارات: <a href="mailto:support-center@talaria-log.com" style="color: #1e3a5f;">support-center@talaria-log.com</a></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 12px; margin: 0;">© 2026 Talaria-Log<br>جميع الحقوق محفوظة</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  },
  {
    id: 'general-announcement',
    name: '📢 General Announcement (Arabic)',
    subject: 'إعلان هام - Talaria Trading',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl"> 
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 22px; margin: 15px 0 0 0;">📢 إعلان هام</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px; text-align: right;">
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">مرحباً،</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">[أضف محتوى الإعلان هنا]</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0;">للاستفسارات: <a href="mailto:support-center@talaria-log.com" style="color: #1e3a5f;">support-center@talaria-log.com</a></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 12px; margin: 0;">© 2026 Talaria Trading</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  },
  {
    id: 'rejection',
    name: '❌ Application Rejection (Arabic)',
    subject: 'بخصوص طلب الانضمام - Talaria Trading',
    content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden;">
                    <tr>
                        <td style="background-color: #1e3a5f; padding: 30px 20px; text-align: center;">
                            <img src="https://talaria-log.com/logo-08.png" alt="Talaria" width="100" style="display: block; margin: 0 auto; max-width: 100px;">
                            <h1 style="color: #ffffff; font-size: 22px; margin: 15px 0 0 0;">بخصوص طلبك</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 30px; text-align: right;">
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">مرحباً،</p>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0 0 20px 0;">شكراً لاهتمامك بالانضمام إلى برنامج المنتورشيب. بعد مراجعة طلبك، نأسف لإعلامك بأنه لم يتم قبول طلبك في الدفعة الحالية.</p>
                            <div style="background-color: #e8f4fd; border-right: 4px solid #1e3a5f; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                                <p style="color: #000000; font-size: 14px; margin: 0;">💡 يمكنك التقديم مرة أخرى في الدفعات القادمة. تابعنا للإعلانات الجديدة.</p>
                            </div>
                            <p style="color: #000000; font-size: 14px; line-height: 1.8; margin: 0;">نتمنى لك التوفيق!</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
                            <p style="color: #000000; font-size: 12px; margin: 0;">© 2026 Talaria Trading</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
  }
];

const BulkEmailManager = ({ users = [] }) => {
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sentEmails, setSentEmails] = useState([]);
  const [hideSentUsers, setHideSentUsers] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [bootcampEmails, setBootcampEmails] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'journal', 'no-journal', 'mentorship'

  // Load template
  const loadTemplate = (template) => {
    setSubject(template.subject);
    setContent(template.content);
    setShowTemplates(false);
  };

  // Load sent emails from localStorage and fetch bootcamp registrations on mount
  useEffect(() => {
    const saved = localStorage.getItem('bulkEmailSentList');
    if (saved) {
      setSentEmails(JSON.parse(saved));
    }
    
    // Fetch bootcamp registration emails
    const fetchBootcampEmails = async () => {
      try {
        const response = await fetch('/api/bootcamp/registrations/emails');
        if (response.ok) {
          const data = await response.json();
          setBootcampEmails(data.emails || []);
        }
      } catch (err) {
        console.error('Failed to fetch bootcamp registrations:', err);
      }
    };
    fetchBootcampEmails();
  }, []);

  // Save sent emails to localStorage
  const saveSentEmails = (emails) => {
    localStorage.setItem('bulkEmailSentList', JSON.stringify(emails));
    setSentEmails(emails);
  };

  // Reset sent emails list
  const resetSentList = () => {
    localStorage.removeItem('bulkEmailSentList');
    setSentEmails([]);
  };

  // Filter users based on search, sent status, and active filter
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const notSent = hideSentUsers ? !sentEmails.includes(user.email) : true;
    
    // Apply active filter
    let matchesFilter = true;
    if (activeFilter === 'journal') {
      matchesFilter = user.has_journal_access === true;
    } else if (activeFilter === 'no-journal') {
      matchesFilter = user.has_journal_access !== true;
    } else if (activeFilter === 'mentorship') {
      matchesFilter = bootcampEmails.includes(user.email?.toLowerCase());
    }
    
    return matchesSearch && notSent && matchesFilter;
  });

  // Toggle user selection
  const toggleUser = (email) => {
    setSelectedEmails(prev => 
      prev.includes(email) 
        ? prev.filter(e => e !== email)
        : [...prev, email]
    );
  };

  // Select all filtered users
  const selectAll = () => {
    const filteredEmails = filteredUsers.map(u => u.email);
    setSelectedEmails(prev => {
      const newSelection = new Set([...prev, ...filteredEmails]);
      return Array.from(newSelection);
    });
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedEmails([]);
  };

  // Select users with journal access
  const selectJournalUsers = () => {
    const journalEmails = users.filter(u => u.has_journal_access).map(u => u.email);
    setSelectedEmails(journalEmails);
  };

  // Send bulk email
  const handleSendEmail = async () => {
    if (selectedEmails.length === 0) {
      setResult({ success: false, message: 'Please select at least one user' });
      return;
    }
    if (!subject.trim()) {
      setResult({ success: false, message: 'Please enter a subject' });
      return;
    }
    if (!content.trim()) {
      setResult({ success: false, message: 'Please enter email content' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/send-bulk-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails: selectedEmails,
          subject: subject,
          content: content
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Successfully sent ${data.sent} emails`,
          details: data
        });
        // Add sent emails to the sent list
        const newSentEmails = [...new Set([...sentEmails, ...selectedEmails])];
        saveSentEmails(newSentEmails);
        // Clear form after success
        setSubject('');
        setContent('');
        setSelectedEmails([]);
      } else {
        setResult({
          success: false,
          message: data.detail || data.error || 'Failed to send emails'
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: 'Network error: ' + err.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full bg-[#0a1628] rounded-2xl border border-[#1e3a5f] overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0a1628] p-6 border-b border-[#2d4a6f]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Mail className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Email Campaign Manager</h2>
              <p className="text-gray-400 text-sm">Send targeted emails to your users</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center px-4 py-2 bg-[#0a1628] rounded-xl border border-[#2d4a6f]">
              <p className="text-2xl font-bold text-blue-400">{selectedEmails.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Selected</p>
            </div>
            <div className="text-center px-4 py-2 bg-[#0a1628] rounded-xl border border-[#2d4a6f]">
              <p className="text-2xl font-bold text-emerald-400">{sentEmails.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Sent</p>
            </div>
            <div className="text-center px-4 py-2 bg-[#0a1628] rounded-xl border border-[#2d4a6f]">
              <p className="text-2xl font-bold text-amber-400">{users.length - sentEmails.length}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Remaining</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#0d1f35] border-b border-[#2d4a6f]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setActiveFilter('all');
              selectAll();
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === 'all' 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                : 'bg-[#1e3a5f] text-gray-300 hover:bg-[#2d4a6f] border border-[#2d4a6f]'
            }`}
          >
            Select All ({users.length})
          </button>
          <button
            onClick={() => {
              setActiveFilter('journal');
              const journalEmails = users.filter(u => u.has_journal_access && (hideSentUsers ? !sentEmails.includes(u.email) : true)).map(u => u.email);
              setSelectedEmails(journalEmails);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === 'journal'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
            }`}
          >
            Journal Users ({users.filter(u => u.has_journal_access).length})
          </button>
          <button
            onClick={() => {
              setActiveFilter('no-journal');
              const mentorshipEmails = users.filter(u => !u.has_journal_access && (hideSentUsers ? !sentEmails.includes(u.email) : true)).map(u => u.email);
              setSelectedEmails(mentorshipEmails);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === 'no-journal'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30'
            }`}
          >
            No Journal ({users.filter(u => !u.has_journal_access).length})
          </button>
          <button
            onClick={() => {
              setActiveFilter('mentorship');
              const applicantEmails = users.filter(u => 
                bootcampEmails.includes(u.email?.toLowerCase()) && 
                (hideSentUsers ? !sentEmails.includes(u.email) : true)
              ).map(u => u.email);
              setSelectedEmails(applicantEmails);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFilter === 'mentorship'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30'
            }`}
          >
            Mentorship Applicants ({users.filter(u => bootcampEmails.includes(u.email?.toLowerCase())).length})
          </button>
          <button
            onClick={() => {
              setActiveFilter('all');
              deselectAll();
            }}
            className="px-4 py-2 bg-[#1e3a5f] text-gray-400 rounded-lg text-sm font-medium hover:bg-[#2d4a6f] border border-[#2d4a6f] transition-all"
          >
            Clear
          </button>
          <div className="w-px h-6 bg-[#2d4a6f] mx-1"></div>
          <button
            onClick={() => setHideSentUsers(!hideSentUsers)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              hideSentUsers 
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                : 'bg-[#1e3a5f] text-gray-400 border border-[#2d4a6f]'
            }`}
          >
            {hideSentUsers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {hideSentUsers ? 'Sent Hidden' : 'All Visible'}
          </button>
          {sentEmails.length > 0 && (
            <button
              onClick={resetSentList}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg border border-red-500/30 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="w-64 pl-10 pr-4 py-2.5 rounded-xl bg-[#1e3a5f] border border-[#2d4a6f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        
        {/* Recipients Panel */}
        <div className="lg:col-span-1 border-r border-[#2d4a6f] bg-[#0d1f35]">
          <div className="p-4 border-b border-[#2d4a6f]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Recipients
              </h3>
              <span className="text-xs text-gray-400 bg-[#1e3a5f] px-3 py-1 rounded-full border border-[#2d4a6f]">
                {filteredUsers.length} users
              </span>
            </div>
          </div>
          <div className="h-[500px] overflow-y-auto custom-scrollbar">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm text-gray-500">No users found</p>
              </div>
            ) : (
              filteredUsers.map((user) => (
                <label
                  key={user.id}
                  className={`flex items-center gap-3 p-3 cursor-pointer border-b border-[#1e3a5f] transition-all ${
                    selectedEmails.includes(user.email) 
                      ? 'bg-blue-500/10 border-l-4 border-l-blue-500' 
                      : 'hover:bg-[#1e3a5f] border-l-4 border-l-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedEmails.includes(user.email)}
                    onChange={() => toggleUser(user.email)}
                    className="h-4 w-4 rounded bg-[#1e3a5f] border-[#2d4a6f] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user.email}</p>
                    {user.full_name && (
                      <p className="text-xs text-gray-500 truncate">{user.full_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {sentEmails.includes(user.email) && (
                      <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded font-medium">
                        SENT
                      </span>
                    )}
                    {user.has_journal_access && (
                      <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded font-medium">
                        JOURNAL
                      </span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Compose Panel */}
        <div className="lg:col-span-2 p-6 bg-[#0a1628]">
          <div className="space-y-5">
            {/* Template Selector */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 px-4 py-3 bg-[#1e3a5f] border border-[#2d4a6f] rounded-xl text-white font-medium hover:bg-[#2d4a6f] transition-all w-full justify-between"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <span>Load Email Template</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
              </button>
              
              {showTemplates && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1e3a5f] rounded-xl shadow-2xl border border-[#2d4a6f] z-50 overflow-hidden">
                  <div className="p-3 bg-[#0d1f35] border-b border-[#2d4a6f]">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Available Templates</p>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {EMAIL_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => loadTemplate(template)}
                        className="w-full px-4 py-3 text-left hover:bg-[#2d4a6f] transition-colors border-b border-[#2d4a6f] last:border-0"
                      >
                        <p className="font-medium text-white">{template.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{template.subject}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter a compelling subject line..."
                className="w-full px-4 py-3 rounded-xl bg-[#1e3a5f] border border-[#2d4a6f] text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-base"
              />
            </div>

            {/* Content */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-gray-300">
                  Email Content
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">HTML supported</span>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      showPreview 
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                        : 'bg-[#1e3a5f] text-gray-400 border border-[#2d4a6f] hover:bg-[#2d4a6f]'
                    }`}
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Hide' : 'Preview'}
                  </button>
                </div>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your email content here. You can use HTML tags for formatting..."
                rows={showPreview ? 8 : 12}
                className="w-full px-4 py-3 rounded-xl bg-[#0d1f35] border border-[#2d4a6f] text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
              />
            </div>

            {/* Preview */}
            {showPreview && content && (
              <div className="rounded-xl border border-[#2d4a6f] overflow-hidden">
                <div className="bg-[#1e3a5f] px-4 py-2.5 flex items-center justify-between border-b border-[#2d4a6f]">
                  <span className="text-sm font-medium text-white">📧 Live Preview</span>
                  <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div 
                  className="p-6 bg-white max-h-[300px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-5 border-t border-[#2d4a6f]">
              <div className="flex items-center gap-4">
                {result && (
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    result.success 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {result.success ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">{result.message}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleSendEmail}
                disabled={sending || selectedEmails.length === 0 || !subject.trim() || !content.trim()}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-base hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:shadow-none"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send to {selectedEmails.length} Recipients
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEmailManager;
