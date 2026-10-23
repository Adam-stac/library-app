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
}
