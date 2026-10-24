package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.users.RegistrationEmails.Email;

/** Emails about an existing account, in the account's language. */
final class AccountEmails {

    private AccountEmails() {}

    static Email passwordReset(String language, String link) {
        if ("ar".equals(language)) {
            return new Email("إعادة تعيين كلمة المرور — مكتبتي", """
                    السلام عليكم،

                    طلب أحدهم إعادة تعيين كلمة المرور لحسابك في «مكتبتي». لاختيار كلمة مرور جديدة، افتح الرابط التالي:
                    %s

                    ينتهي هذا الرابط خلال ساعة واحدة، ولا يُستخدم إلا مرة واحدة.
                    إن لم تطلب ذلك، فتجاهل هذه الرسالة: لن يتغيّر شيء، وتبقى كلمة مرورك الحالية كما هي.
                    """.formatted(link));
        }
        return new Email("Reset your password — My Library", """
                Assalamu alaykum,

                Someone asked to reset the password for your My Library account. To choose a new password, open this link:
                %s

                The link expires in 1 hour and can only be used once.
                If you didn't ask for this, you can ignore this email: nothing changes and your current password still works.
                """.formatted(link));
    }

    static Email passwordChanged(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم تغيير كلمة مرورك — مكتبتي", """
                    السلام عليكم،

                    تم تغيير كلمة المرور لحسابك في «مكتبتي»، وسُجّل خروجك من الأجهزة الأخرى.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Your password was changed — My Library", """
                Assalamu alaykum,

                The password for your My Library account was just changed, and other devices were signed out.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }

    static Email twoFactorTurnedOn(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم تفعيل التحقق بخطوتين — مكتبتي", """
                    السلام عليكم،

                    فُعّل التحقق بخطوتين لحسابك في «مكتبتي»: سيُطلب منك رمز من تطبيق المصادقة عند كل تسجيل دخول.
                    احفظ رموز الاسترداد في مكان آمن؛ فهي طريقك إلى حسابك إن فقدت هاتفك.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Two-step verification turned on — My Library", """
                Assalamu alaykum,

                Two-step verification was turned on for your My Library account: signing in now also needs a code from your authenticator app.
                Keep your recovery codes somewhere safe; they get you in if you lose your phone.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }

    static Email twoFactorTurnedOff(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تم إيقاف التحقق بخطوتين — مكتبتي", """
                    السلام عليكم،

                    أُوقف التحقق بخطوتين لحسابك في «مكتبتي»، فأصبح تسجيل الدخول بكلمة المرور وحدها.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا، ثم فعّل التحقق بخطوتين من جديد:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Two-step verification turned off — My Library", """
                Assalamu alaykum,

                Two-step verification was turned off for your My Library account, so signing in now needs only your password.
                If this wasn't you, reset your password straight away here, then turn two-step verification back on:
                %s
                """.formatted(resetLink));
    }

    static Email recoveryCodeUsed(String language, int left, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("استُخدم رمز استرداد — مكتبتي", """
                    السلام عليكم،

                    سُجّل الدخول إلى حسابك في «مكتبتي» باستخدام رمز استرداد. بقي لديك %d من رموز الاسترداد.
                    إن قلّت رموزك، فأنشئ رموزًا جديدة من صفحة التحقق بخطوتين.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(left, resetLink));
        }
        return new Email("A recovery code was used — My Library", """
                Assalamu alaykum,

                Someone signed in to your My Library account with a recovery code. You have %d recovery codes left.
                If you're running low, create new ones on the two-step verification page.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(left, resetLink));
    }

    static Email newRecoveryCodes(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("رموز استرداد جديدة — مكتبتي", """
                    السلام عليكم،

                    أُنشئت رموز استرداد جديدة لحسابك في «مكتبتي»، ولم تعد الرموز القديمة صالحة.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("New recovery codes — My Library", """
                Assalamu alaykum,

                New recovery codes were created for your My Library account, and the old ones no longer work.
                If this wasn't you, reset your password straight away here:
                %s
                """.formatted(resetLink));
    }
}
