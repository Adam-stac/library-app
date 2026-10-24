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

    static Email passkeyAdded(String language, String label, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("أُضيف مفتاح مرور — مكتبتي", """
                    السلام عليكم،

                    أُضيف مفتاح مرور جديد («%s») إلى حسابك في «مكتبتي»، ويمكن استخدامه لتسجيل الدخول دون كلمة مرور.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا، ثم احذف مفتاح المرور من صفحة مفاتيح المرور:
                    %s
                    """.formatted(label, resetLink));
        }
        return new Email("A passkey was added — My Library", """
                Assalamu alaykum,

                A new passkey ("%s") was added to your My Library account. It can be used to sign in without a password.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here, then remove the passkey on the passkeys page:
                %s
                """.formatted(label, resetLink));
    }

    static Email passkeyRemoved(String language, String label, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("حُذف مفتاح مرور — مكتبتي", """
                    السلام عليكم،

                    حُذف مفتاح المرور «%s» من حسابك في «مكتبتي»، فلم يعد صالحًا لتسجيل الدخول.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    """.formatted(label, resetLink));
        }
        return new Email("A passkey was removed — My Library", """
                Assalamu alaykum,

                The passkey "%s" was removed from your My Library account and can no longer be used to sign in.
                If it wasn't you, reset your password straight away here:
                %s
                """.formatted(label, resetLink));
    }

    static Email newSignIn(String language, String device, String securityLink, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("تسجيل دخول جديد إلى حسابك — مكتبتي", """
                    السلام عليكم،

                    سُجّل الدخول إلى حسابك في «مكتبتي» من جهاز جديد: %s.
                    إن كنت أنت، فلا داعي لأي إجراء.
                    إن لم تكن أنت، فأعد تعيين كلمة المرور فورًا من هنا:
                    %s
                    ويمكنك مراجعة نشاط حسابك وتسجيل الخروج من الأجهزة الأخرى من هنا:
                    %s
                    """.formatted(device, resetLink, securityLink));
        }
        return new Email("New sign-in to your account — My Library", """
                Assalamu alaykum,

                Someone signed in to your My Library account from a new device: %s.
                If this was you, there's nothing to do.
                If it wasn't you, reset your password straight away here:
                %s
                You can review your account's activity and sign out other devices here:
                %s
                """.formatted(device, resetLink, securityLink));
    }

    static Email accountLocked(String language, String resetLink) {
        if ("ar".equals(language)) {
            return new Email("أُوقف تسجيل الدخول إلى حسابك مؤقتًا — مكتبتي", """
                    السلام عليكم،

                    أُدخلت كلمة مرور أو رمز خاطئ عدة مرات متتالية، فأوقفنا تسجيل الدخول إلى حسابك في «مكتبتي» ١٥ دقيقة لحمايته.
                    إن كنت أنت، فانتظر قليلًا ثم حاول مجددًا.
                    إن لم تكن أنت، فقد يكون أحدهم يحاول تخمين كلمة مرورك. يُستحسن تغييرها من هنا:
                    %s
                    """.formatted(resetLink));
        }
        return new Email("Sign-in to your account was paused — My Library", """
                Assalamu alaykum,

                A wrong password or code was entered several times in a row, so we've paused sign-in to your My Library account for 15 minutes to protect it.
                If this was you, wait a little and try again.
                If it wasn't you, someone may be trying to guess your password. It's a good idea to change it here:
                %s
                """.formatted(resetLink));
    }
}
