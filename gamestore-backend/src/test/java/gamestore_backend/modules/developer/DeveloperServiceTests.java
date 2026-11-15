package gamestore_backend.modules.developer;

import static gamestore_backend.modules.developer.DeveloperDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import gamestore_backend.modules.commerce.CommerceException;
import gamestore_backend.modules.database.ProcedureCalls;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;

/** Java guards/adapter tests. PostgreSQL rules are covered by HuanDatabaseProgrammabilityTests. */
class DeveloperServiceTests {
    DeveloperRepository repository; ProcedureCalls procedures; DeveloperService service; Authentication auth;
    @BeforeEach void setup() {
        repository=mock(DeveloperRepository.class);procedures=mock(ProcedureCalls.class);service=new DeveloperService(repository,procedures);
        auth=mock(Authentication.class);when(auth.isAuthenticated()).thenReturn(true);when(auth.getName()).thenReturn("applicant");
    }
    @Test void rejectsMissingAuthenticationAndMissingAccount() {
        assertEquals(HttpStatus.UNAUTHORIZED,assertThrows(CommerceException.class,()->service.authenticate(null)).status());
        assertEquals(HttpStatus.UNAUTHORIZED,assertThrows(CommerceException.class,()->service.authenticate(auth)).status());
    }
    @Test void checksCurrentDatabaseRoleForAdminRead() {
        when(repository.actor("applicant")).thenReturn(Optional.of(new UserAccount(UUID.randomUUID(),"applicant","USER","VERIFIED")));
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(CommerceException.class,()->service.getAdminSubmissions(auth,null,"",0,20)).status());
        verify(repository,never()).page(any(),any(),anyInt(),anyInt());
    }
    @Test void submitCallsProcedureAndReloadsViewWithTrimmedReason() {
        UUID id=UUID.randomUUID();
        var response=new DeveloperSubmissionResponse(id,UUID.randomUUID(),"applicant","PENDING","Build games",null);
        when(procedures.uuid("sp_submit_developer_application","applicant","Build games")).thenReturn(id);
        when(repository.find(id)).thenReturn(Optional.of(response));
        assertEquals(response,service.submit(auth,new DeveloperApplicationInput("  Build games  ")));
        verify(procedures).uuid("sp_submit_developer_application","applicant","Build games");
    }
    @Test void validatesReasonAndDecisionBeforeDatabaseWrite() {
        for(String value:List.of(" ","x".repeat(2001))) assertEquals(HttpStatus.BAD_REQUEST,assertThrows(CommerceException.class,()->service.submit(auth,new DeveloperApplicationInput(value))).status());
        assertThrows(CommerceException.class,()->service.review(auth,UUID.randomUUID(),new DeveloperReviewInput("PENDING","Reason")));
        verifyNoInteractions(procedures);
    }
    @Test void reviewUsesProcedureAsOnlyWriter() {
        UUID id=UUID.randomUUID();
        var response=new DeveloperSubmissionResponse(id,UUID.randomUUID(),"applicant","ACCEPTED","Build","Welcome");
        when(repository.find(id)).thenReturn(Optional.of(response));
        assertEquals(response,service.review(auth,id,new DeveloperReviewInput("ACCEPTED"," Welcome ")));
        verify(procedures).call("sp_review_developer_application","applicant",id,"ACCEPTED","Welcome");
    }
    @Test void validatesPaginationAndPreservesLongOffsetInRepositoryContract() {
        when(repository.actor("applicant")).thenReturn(Optional.of(new UserAccount(UUID.randomUUID(),"applicant","ADMINISTRATOR","VERIFIED")));
        assertThrows(CommerceException.class,()->service.getAdminSubmissions(auth,null,"",-1,20));
        assertThrows(CommerceException.class,()->service.getAdminSubmissions(auth,null,"x".repeat(201),0,20));
        service.getAdminSubmissions(auth,"",null,Integer.MAX_VALUE,100);
        verify(repository).page(null,"",Integer.MAX_VALUE,100);
    }
}
