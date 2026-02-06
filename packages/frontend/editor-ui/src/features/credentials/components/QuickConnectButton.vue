<script setup lang="ts">
import { computed } from 'vue';
import { N8nButton2, N8nTooltip } from '@n8n/design-system';
import { useI18n } from '@n8n/i18n';
import CredentialIcon from './CredentialIcon.vue';
import GoogleAuthButton from './CredentialEdit/GoogleAuthButton.vue';
import { useCredentialOAuth } from '../composables/useCredentialOAuth';
import { useCredentialsStore } from '../credentials.store';

const props = defineProps<{
	credentialTypeName: string;
	label?: string;
	disabled?: boolean;
	disabledTooltip?: string;
}>();

defineEmits<{
	click: [];
}>();

const i18n = useI18n();
const credentialsStore = useCredentialsStore();
const { isGoogleOAuthType } = useCredentialOAuth();

const providerName = computed(() => {
	const credentialType = credentialsStore.getCredentialTypeByName(props.credentialTypeName);
	const displayName = credentialType?.displayName ?? props.credentialTypeName;
	return displayName.replace(/\s*(OAuth2?|API|Credentials?)\s*/gi, '').trim();
});

const buttonLabel = computed(() => {
	if (props.label) return props.label;
	return i18n.baseText('nodeCredentials.quickConnect.connectTo', {
		interpolate: { provider: providerName.value },
	});
});
</script>

<template>
	<N8nTooltip :disabled="!disabled || !disabledTooltip" placement="top">
		<template #content>{{ disabledTooltip }}</template>
		<span>
			<GoogleAuthButton
				v-if="isGoogleOAuthType(credentialTypeName)"
				:disabled="disabled"
				@click="!disabled && $emit('click')"
			/>
			<N8nButton2
				v-else
				variant="subtle"
				size="small"
				theme="light"
				:disabled="disabled"
				@click="$emit('click')"
			>
				<CredentialIcon :credential-type-name="credentialTypeName" :size="16" />
				{{ buttonLabel }}
			</N8nButton2>
		</span>
	</N8nTooltip>
</template>
